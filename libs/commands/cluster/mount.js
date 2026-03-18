/**
 * 挂载合约 (Mount)
 * 命令: fsca cluster mount <id> <name>
 * 操作: 
 *  1. 检查 currentOperating 是否设置
 *  2. 调用 ClusterManager.registerContract(id, name, currentOperating)
 *  3. 更新 project.json 缓存 (移动 unmounted -> running)
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');
const { nextGeneration, nextDeploySeq, normalizeRecord } = require('../version');
const { sendTx } = require('../txExecutor');
const { acquireLock } = require('../clusterLock');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function saveProjectConfig(rootDir, config) {
    const configPath = path.join(rootDir, 'project.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
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

module.exports = async function mount({ rootDir, args = {} }) {
    try {
        // 1. Inputs
        const id   = args.id   || args.arg0;
        const name = args.name || args.arg1;
        if (!id || !name) throw new Error("ID and Name are required.");

        // 2. Config
        const config = loadProjectConfig(rootDir);
        const currentOperating = config.fsca?.currentOperating;

        if (!currentOperating || !ethers.isAddress(currentOperating)) {
            throw new Error("No valid current operating contract. Run 'fsca cluster choose <addr>' or 'fsca deploy' first.");
        }

        // Guard: reject deprecated/archived contracts
        const allDeployed = config.fsca.alldeployedcontracts || [];
        const existingRecord = allDeployed.find(r => r.address && r.address.toLowerCase() === currentOperating.toLowerCase());
        if (existingRecord) {
            const normalized = normalizeRecord(existingRecord, 'alldeployedcontracts');
            if (normalized.status === 'deprecated') {
                throw new Error(`Contract ${currentOperating} is deprecated. Use "fsca cluster rollback" to restore it explicitly.`);
            }
            if (normalized.status === 'archived') {
                throw new Error(`Contract ${currentOperating} is archived and cannot be mounted.`);
            }
        }

        console.log(`Mounting Contract...`);
        console.log(`  Address: ${currentOperating}`);
        console.log(`  ID: ${id}`);
        console.log(`  Name: ${name}`);

        // 3. Connect
        const provider = getProvider(config.network.rpc);
        const signer = getSigner(config.account.privateKey, provider);
        const clusterAddr = config.fsca.clusterAddress;
        const abi = loadClusterManagerABI(rootDir);
        const cluster = new ethers.Contract(clusterAddr, abi, signer);

        const lock = acquireLock(rootDir, clusterAddr, 'cluster mount');
        try {

        // 4. Send Transaction
        const receipt = await sendTx(() => cluster.registerContract(id, name, currentOperating), { label: `registerContract #${id}` });
        console.log(`✓ Contract mounted successfully. Block: ${receipt.blockNumber}`);

        // 5. Update Cache
        const timestamp = Math.floor(Date.now() / 1000);
        const contractData = {
            name: name,
            address: currentOperating,
            contractId: id,
            timeStamp: timestamp,
            mountTx: receipt.hash || receipt.transactionHash,
        };

        if (!config.fsca.alldeployedcontracts) config.fsca.alldeployedcontracts = [];
        if (!config.fsca.runningcontracts) config.fsca.runningcontracts = [];
        if (!config.fsca.unmountedcontracts) config.fsca.unmountedcontracts = [];

        const initialUnmountedCount = config.fsca.unmountedcontracts.length;
        config.fsca.unmountedcontracts = config.fsca.unmountedcontracts.filter(c => c.address.toLowerCase() !== currentOperating.toLowerCase());

        const existIndex = config.fsca.runningcontracts.findIndex(c => c.contractId == id);
        if (existIndex >= 0) {
            config.fsca.runningcontracts[existIndex] = contractData;
        } else {
            config.fsca.runningcontracts.push(contractData);
        }

        const recordInAll = config.fsca.alldeployedcontracts.find(
            c => c.address && c.address.toLowerCase() === currentOperating.toLowerCase()
        );
        const alreadyHasGeneration = recordInAll && recordInAll.generation != null;
        const newGen = alreadyHasGeneration
            ? recordInAll.generation
            : nextGeneration(config.fsca.alldeployedcontracts, Number(id));
        const newSeq = nextDeploySeq(config.fsca.alldeployedcontracts);
        let foundInAll = false;
        config.fsca.alldeployedcontracts = config.fsca.alldeployedcontracts.map(c => {
            if (c.address.toLowerCase() === currentOperating.toLowerCase()) {
                foundInAll = true;
                return {
                    ...c,
                    contractId: Number(id),
                    name,
                    generation: newGen,
                    deploySeq: c.deploySeq || newSeq,
                    status: 'mounted',
                    podSnapshot: c.podSnapshot || { active: [], passive: [] },
                };
            }
            return c;
        });
        if (!foundInAll) {
            config.fsca.alldeployedcontracts.push({
                name,
                address: currentOperating,
                contractId: Number(id),
                generation: newGen,
                deploySeq: newSeq,
                status: 'mounted',
                timeStamp: timestamp,
                podSnapshot: { active: [], passive: [] },
            });
        }

        saveProjectConfig(rootDir, config);
        console.log(`✓ Cache updated: Moved from Unmounted (${initialUnmountedCount} -> ${config.fsca.unmountedcontracts.length}) to Running.`);

        } finally {
            lock.release();
        }

    } catch (error) {
        console.error('Failed to mount:', error.message);
        process.exit(1);
    }
};
