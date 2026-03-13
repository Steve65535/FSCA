/**
 * 卸载合约 (Unmount)
 * 命令: fsca cluster unmount <id>
 * 操作:
 *  1. 调用 ClusterManager.deleteContract(id)
 *  2. 更新 project.json 缓存 (移动 running -> unmounted)
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
        path.join(rootDir, 'artifacts', 'contracts', 'core', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
    ];
    for (const p of artifactPaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
    }
    throw new Error('ClusterManager ABI not found.');
}

module.exports = async function unmount({ rootDir, args = {} }) {
    try {
        const { id } = args;
        if (!id) throw new Error("ID is required.");

        const config = loadProjectConfig(rootDir);

        // Connect
        const provider = getProvider(config.network.rpc);
        const signer = getSigner(config.account.privateKey, provider);
        const clusterAddr = config.fsca.clusterAddress;
        const abi = loadClusterManagerABI(rootDir);
        const cluster = new ethers.Contract(clusterAddr, abi, signer);

        console.log(`Unmounting Contract ID: ${id}...`);

        // 1. Send Transaction
        // function deleteContract(uint32 id)
        const tx = await cluster.deleteContract(id);
        console.log(`Transaction sent: ${tx.hash}`);

        await tx.wait();
        console.log(`✓ Contract unmounted successfully.`);

        // 2. Update Cache
        if (!config.fsca.runningcontracts) config.fsca.runningcontracts = [];
        if (!config.fsca.unmountedcontracts) config.fsca.unmountedcontracts = [];

        // Find the contract in running list
        const targetIndex = config.fsca.runningcontracts.findIndex(c => c.contractId == id);
        if (targetIndex >= 0) {
            const removedContract = config.fsca.runningcontracts[targetIndex];

            // Add to unmounted
            // Reset ID since it is deleted from cluster
            removedContract.contractId = null;
            config.fsca.unmountedcontracts.push(removedContract);

            // Remove from running
            config.fsca.runningcontracts.splice(targetIndex, 1);

            console.log(`✓ Cache updated: Moved ${removedContract.name} (${removedContract.address}) from Running to Unmounted.`);

            // Update currentOperating if needed (optional but helpful)
            if (config.fsca.currentOperating === removedContract.address) {
                console.log(`  (Note: This contract is still set as currentOperating)`);
            }
        } else {
            console.warn(`! Contract ID ${id} unmounted on chain, but not found in local 'runningcontracts' cache.`);
        }

        saveProjectConfig(rootDir, config);

    } catch (error) {
        console.error('Failed to unmount:', error.message);
        process.exit(1);
    }
};
