/**
 * 链接合约 (Link)
 * 根据 whetherMounted 状态自动选择调用接口
 * Before Mount (0): addActivePodBeforeMount / addPassivePodBeforeMount
 * After Mount (1): addActivePodAfterMount / addPassivePodAfterMount
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');
const { sendTx } = require('../txExecutor');
const { acquireLock } = require('../clusterLock');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;

const TEMPLATE_ALL_ABI = [
    'function getAllActiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])',
    'function getAllPassiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])',
];

function saveProjectConfig(rootDir, config) {
    fs.writeFileSync(path.join(rootDir, 'project.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function loadClusterManagerABI(rootDir) {
    const artifactPaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'deployed', 'structure', 'ClusterManager.sol', 'ClusterManager.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'core', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
    ];
    for (const p of artifactPaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
    }
    throw new Error('ClusterManager ABI not found.');
}

function loadNormalTemplateABI(rootDir) {
    const possiblePaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normalTemplate.sol', 'normalTemplate.json'),
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
    }
    return [
        "function whetherMounted() view returns (uint8)",
        "event ModuleChanged(address indexed podAddr, uint32 contractId, address moduleAddress, string action)"
    ];
}

module.exports = async function link({ rootDir, args = {} }) {
    try {
        const rawType = args.type || args.arg0;
        const targetAddress = args.targetAddress || args.arg1;
        const targetId = args.targetId || args.arg2;
        const type = rawType === 'active' ? 'positive' : rawType;
        const displayType = type === 'positive' ? 'active' : type;

        if (type !== 'positive' && type !== 'passive') {
            throw new Error("Type must be 'active'|'positive' or 'passive'");
        }
        if (!ethers.isAddress(targetAddress)) {
            throw new Error("Invalid targetAddress");
        }
        const tId = Number(targetId);

        const config = loadProjectConfig(rootDir);
        const currentOperating = config.arkheion?.currentOperating;

        if (!currentOperating) {
            throw new Error("No current operating contract selected.");
        }

        const provider = getProvider(config.network.rpc);
        const signer = getSigner(config.account.privateKey, provider);

        // Check whetherMounted
        const templateAbi = loadNormalTemplateABI(rootDir);
        const sourceContract = new ethers.Contract(currentOperating, templateAbi, provider);

        let isMounted = 0;
        try {
            isMounted = await sourceContract.whetherMounted();
        } catch (e) {
            console.warn(`Warning: Could not check whetherMounted. Assuming 0 (Before Mount). Error: ${e.message}`);
        }

        console.log(`Linking ${displayType} pod...`);
        console.log(`  Source: ${currentOperating}`);
        console.log(`  State: ${isMounted == 1 ? 'MOUNTED' : 'UNMOUNTED'}`);
        console.log(`  Target: ${targetAddress} (ID: ${tId})`);

        const clusterAddr = config.arkheion.clusterAddress;
        const clusterAbi = loadClusterManagerABI(rootDir);
        const clusterContract = new ethers.Contract(clusterAddr, clusterAbi, signer);

        const lock = acquireLock(rootDir, clusterAddr, 'cluster link');
        try {

            const label = `${isMounted == 0 ? 'BeforeMount' : 'AfterMount'}:${displayType}:${tId}`;
            let receipt;
            if (isMounted == 0) {
                if (type === 'positive') {
                    receipt = await sendTx(() => clusterContract.addActivePodBeforeMount(currentOperating, targetAddress, tId), { label });
                } else {
                    receipt = await sendTx(() => clusterContract.addPassivePodBeforeMount(currentOperating, targetAddress, tId), { label });
                }
            } else {
                if (type === 'positive') {
                    receipt = await sendTx(() => clusterContract.addActivePodAfterMount(currentOperating, targetAddress, tId), { label });
                } else {
                    receipt = await sendTx(() => clusterContract.addPassivePodAfterMount(currentOperating, targetAddress, tId), { label });
                }
            }

            console.log(`✓ Transaction confirmed in block ${receipt.blockNumber}`);

            // Snapshot sync: read live pod state from chain and update project.json
            try {
                const contract = new ethers.Contract(currentOperating, TEMPLATE_ALL_ABI, provider);
                const [activeModules, passiveModules] = await Promise.all([
                    contract.getAllActiveModules(),
                    contract.getAllPassiveModules(),
                ]);
                const podSnapshot = {
                    active: activeModules.map(m => ({ contractId: Number(m.contractId) })),
                    passive: passiveModules.map(m => ({ contractId: Number(m.contractId) })),
                };
                config.arkheion.alldeployedcontracts = (config.arkheion.alldeployedcontracts || []).map(r =>
                    r.address && r.address.toLowerCase() === currentOperating.toLowerCase()
                        ? { ...r, podSnapshot }
                        : r
                );
                saveProjectConfig(rootDir, config);
                console.log(`  Pod snapshot: active=[${podSnapshot.active.map(p => p.contractId).join(',')}] passive=[${podSnapshot.passive.map(p => p.contractId).join(',')}]`);
            } catch (e) {
                throw new Error(`Link already changed on-chain, but pod snapshot sync failed: ${e.message}`);
            }

            // Attempt parse logs
            try {
                const iface = new ethers.Interface(templateAbi);
                for (const log of receipt.logs) {
                    try {
                        const parsed = iface.parseLog(log);
                        if (parsed && parsed.name === 'ModuleChanged') {
                            console.log(`  Event: ModuleChanged`);
                            console.log(`    Action: ${parsed.args[3]}`);
                            console.log(`    Module: ${parsed.args[2]}`);
                        }
                    } catch (e) { }
                }
            } catch (e) { }

        } finally {
            lock.release();
        }

    } catch (error) {
        console.error('Failed to link:', error.message);
        process.exit(1);
    }
};
