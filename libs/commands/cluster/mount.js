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
    ];
    for (const p of artifactPaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
    }
    throw new Error('ClusterManager ABI not found.');
}

module.exports = async function mount({ rootDir, args = {} }) {
    try {
        // 1. Inputs
        const { id, name } = args;
        if (!id || !name) throw new Error("ID and Name are required.");

        // 2. Config
        const config = loadProjectConfig(rootDir);
        const currentOperating = config.fsca?.currentOperating;

        if (!currentOperating || !ethers.isAddress(currentOperating)) {
            throw new Error("No valid current operating contract. Run 'fsca cluster choose <addr>' or 'fsca deploy' first.");
        }

        console.log(`Mounting Contract...`);
        console.log(`  Address: ${currentOperating}`);
        console.log(`  ID: ${id}`);
        console.log(`  Name: ${name}`);

        // 3. Connect
        const provider = getProvider(config.network.rpc);
        const signer = getSigner(provider, config.account.privateKey);
        const clusterAddr = config.fsca.clusterAddress;
        const abi = loadClusterManagerABI(rootDir);
        const cluster = new ethers.Contract(clusterAddr, abi, signer);

        // 4. Send Transaction
        // function registerContract(uint32 id, string memory name, address contractAddr)
        const tx = await cluster.registerContract(id, name, currentOperating);
        console.log(`Transaction sent: ${tx.hash}`);

        await tx.wait();
        console.log(`✓ Contract mounted successfully.`);

        // 5. Update Cache
        const timestamp = Math.floor(Date.now() / 1000);
        const contractData = {
            name: name,
            address: currentOperating,
            contractId: id,
            timeStamp: timestamp,
            mountTx: tx.hash
        };

        // Initialize arrays if missing
        if (!config.fsca.alldeployedcontracts) config.fsca.alldeployedcontracts = [];
        if (!config.fsca.runningcontracts) config.fsca.runningcontracts = [];
        if (!config.fsca.unmountedcontracts) config.fsca.unmountedcontracts = [];

        // Remove from unmountedcontracts (filter by address)
        const initialUnmountedCount = config.fsca.unmountedcontracts.length;
        config.fsca.unmountedcontracts = config.fsca.unmountedcontracts.filter(c => c.address.toLowerCase() !== currentOperating.toLowerCase());

        // Add to runningcontracts
        // Check if already exists to avoid duplicates
        const existIndex = config.fsca.runningcontracts.findIndex(c => c.contractId == id);
        if (existIndex >= 0) {
            config.fsca.runningcontracts[existIndex] = contractData; // upate
        } else {
            config.fsca.runningcontracts.push(contractData);
        }

        // Also update alldeployedcontracts with ID info if found
        config.fsca.alldeployedcontracts = config.fsca.alldeployedcontracts.map(c => {
            if (c.address.toLowerCase() === currentOperating.toLowerCase()) {
                return { ...c, contractId: id, name: name }; // update info
            }
            return c;
        });

        saveProjectConfig(rootDir, config);
        console.log(`✓ Cache updated: Moved from Unmounted (${initialUnmountedCount} -> ${config.fsca.unmountedcontracts.length}) to Running.`);

    } catch (error) {
        console.error('Failed to mount:', error.message);
        process.exit(1);
    }
};
