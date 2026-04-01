/**
 * 卸载合约 (Unmount)
 * 命令: arkheion cluster unmount <id>
 * 操作:
 *  1. 调用 ClusterManager.deleteContract(id)
 *  2. 更新 project.json 缓存 (移动 running -> unmounted)
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
        const clusterAddr = config.arkheion.clusterAddress;
        const abi = loadClusterManagerABI(rootDir);
        const cluster = new ethers.Contract(clusterAddr, abi, signer);

        console.log(`Unmounting Contract ID: ${id}...`);

        const lock = acquireLock(rootDir, clusterAddr, 'cluster unmount');
        try {

            // 1. Send Transaction via txExecutor (retry on transient RPC errors)
            const receipt = await sendTx(() => cluster.deleteContract(id), { label: `deleteContract id=${id}` });
            console.log(`Transaction sent: ${receipt.hash}`);
            console.log(`✓ Contract unmounted successfully.`);

            // 2. Update Cache
            if (!config.arkheion.runningcontracts) config.arkheion.runningcontracts = [];
            if (!config.arkheion.unmountedcontracts) config.arkheion.unmountedcontracts = [];

            // Find the contract in running list
            const targetIndex = config.arkheion.runningcontracts.findIndex(c => c.contractId == id);
            if (targetIndex >= 0) {
                const removedContract = config.arkheion.runningcontracts[targetIndex];

                // Add to unmounted — reset contractId since deleted from cluster
                removedContract.contractId = null;
                config.arkheion.unmountedcontracts.push(removedContract);

                // Remove from running
                config.arkheion.runningcontracts.splice(targetIndex, 1);

                // Sync alldeployedcontracts status: mounted -> deployed
                if (config.arkheion.alldeployedcontracts) {
                    const addr = removedContract.address.toLowerCase();
                    config.arkheion.alldeployedcontracts = config.arkheion.alldeployedcontracts.map(r =>
                        r.address && r.address.toLowerCase() === addr
                            ? { ...r, status: 'deployed' }
                            : r
                    );
                }

                console.log(`✓ Cache updated: Moved ${removedContract.name} (${removedContract.address}) from Running to Unmounted.`);

                if (config.arkheion.currentOperating === removedContract.address) {
                    console.log(`  (Note: This contract is still set as currentOperating)`);
                }
            } else {
                console.warn(`! Contract ID ${id} unmounted on chain, but not found in local 'runningcontracts' cache.`);
            }

            saveProjectConfig(rootDir, config);

        } finally {
            lock.release();
        }

    } catch (error) {
        console.error('Failed to unmount:', error.message);
        process.exit(1);
    }
};
