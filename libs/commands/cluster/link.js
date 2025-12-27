/**
 * 链接合约
 * 仅当合约 wetherMounted == 0 时可用
 * 命令: fsca cluster link <type> <targetAddress> <targetId>
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// 加载 chain 目录下的封装函数
const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;

/**
 * 加载项目配置
 */
function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found.');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return config;
}

/**
 * 加载 ClusterManager ABI
 */
function loadClusterManagerABI(rootDir) {
    const artifactPaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'deployed', 'structure', 'ClusterManager.sol', 'ClusterManager.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
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
    // Fallback minimal ABI with event
    return [
        "function wetherMounted() view returns (uint8)",
        "event ModuleChanged(address indexed podAddr, uint32 contractId, address moduleAddress, string action)"
    ];
}

module.exports = async function link({ rootDir, args = {} }) {
    try {
        const { type, targetAddress, targetId } = args;

        // Validate inputs
        if (type !== 'positive' && type !== 'passive') {
            throw new Error("Type must be 'positive' or 'passive'");
        }
        if (!ethers.isAddress(targetAddress)) {
            throw new Error("Invalid targetAddress");
        }
        const tId = Number(targetId);
        if (isNaN(tId)) {
            throw new Error("Invalid targetId");
        }

        // Load Config
        const config = loadProjectConfig(rootDir);
        const currentOperating = config.fsca?.currentOperating;

        if (!currentOperating) {
            throw new Error("No current operating contract selected. Please run 'fsca cluster choose <addr>' first.");
        }
        console.log(`Current Operating Contract: ${currentOperating}`);

        const provider = getProvider(config.network.rpc);
        const signer = getSigner(provider, config.account.privateKey);

        // Check wetherMounted on Source
        const templateAbi = loadNormalTemplateABI(rootDir);
        const sourceContract = new ethers.Contract(currentOperating, templateAbi, provider);

        try {
            const isMounted = await sourceContract.wetherMounted();
            if (isMounted != 0) {
                throw new Error(`Current operating contract is already mounted (wetherMounted=${isMounted}). Cannot link manually.`);
            }
        } catch (e) {
            console.warn(`Warning: Could not verify wetherMounted status: ${e.message}`);
            console.warn(`Proceeding anyway...`);
        }

        // Connect to ClusterManager
        const clusterAddr = config.fsca.clusterAddress;
        const clusterAbi = loadClusterManagerABI(rootDir);
        const clusterContract = new ethers.Contract(clusterAddr, clusterAbi, signer);

        console.log(`Linking ${type} pod...`);
        console.log(`  Source: ${currentOperating}`);
        console.log(`  Target: ${targetAddress}`);
        console.log(`  Target ID: ${tId}`);

        let tx;
        // NOTE: functions are on ClusterManager, calling source.addActiveModule...
        if (type === 'positive') {
            tx = await clusterContract.addActivePodBeforeMount(currentOperating, targetAddress, tId);
        } else {
            tx = await clusterContract.addPassivePodBeforeMount(currentOperating, targetAddress, tId);
        }

        console.log(`Transaction sent: ${tx.hash}`);
        console.log(`Waiting for confirmation...`);

        const receipt = await tx.wait();
        console.log(`✓ Transaction confirmed in block ${receipt.blockNumber}`);

        // Parse logs
        try {
            // Try v6 Interface
            let iface;
            if (ethers.Interface) {
                iface = new ethers.Interface(templateAbi);
            } else if (ethers.utils && ethers.utils.Interface) {
                // Fallback for v5
                iface = new ethers.utils.Interface(templateAbi);
            }

            if (iface) {
                for (const log of receipt.logs) {
                    try {
                        const parsed = iface.parseLog(log);
                        if (parsed && parsed.name === 'ModuleChanged') {
                            console.log(`  Event: ModuleChanged`);
                            console.log(`    Pod: ${parsed.args[0]}`); // podAddr
                            console.log(`    ID: ${parsed.args[1]}`); // contractId
                            console.log(`    Module: ${parsed.args[2]}`); // moduleAddress
                            console.log(`    Action: ${parsed.args[3]}`); // action
                        }
                    } catch (e) {
                        // Ignore logs that don't match or parse error
                    }
                }
            }
        } catch (e) {
            console.log("Could not parse logs details:", e.message);
        }

    } catch (error) {
        console.error('Failed to link:', error.message);
        process.exit(1);
    }
};
