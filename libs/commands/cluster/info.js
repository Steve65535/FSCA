/**
 * Cluster Contract Info
 * arkheion cluster info <id>
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const chainProvider = require('../../../chain/provider');
const getProvider = chainProvider.getProvider;

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
    ];
    for (const p of artifactPaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
    }
    throw new Error('ClusterManager ABI not found.');
}

module.exports = async function info({ rootDir, args = {}, subcommands = [], commandName = '' }) {
    try {
        let id = args.id || args.arg0;

        if (!id) {
            // If ID not in args, look in subcommands.
            if (subcommands.length > 0) {
                const last = subcommands[subcommands.length - 1];
                if (last !== 'info' && last !== 'cluster') {
                    id = last;
                }
            }
        }

        if (!id || (isNaN(id) && !ethers.isAddress(id))) {
            // strict check? ID is uint32, so number.
            // But let's just error if it's "cluster" or "info"
            if ((id === 'cluster' || id === 'info') && subcommands.length > 0) {
                // Try to iterate to find the actual arg? 
                // Whatever, let's just error relevantly
                throw new Error("ID is required.");
            }
        }

        if (!id) throw new Error("ID is required.");

        // Load Config
        const config = loadProjectConfig(rootDir);
        const clusterAddress = config.arkheion?.clusterAddress;

        if (!clusterAddress || !ethers.isAddress(clusterAddress)) {
            throw new Error("Cluster address not configured.");
        }

        const provider = getProvider(config.network.rpc);
        const abi = loadClusterManagerABI(rootDir);
        const contract = new ethers.Contract(clusterAddress, abi, provider);

        console.log(`Querying contract info for ID: ${id}...`);

        // returns (contractRegistration memory)
        // struct { uint32 contractId; string name; address contractAddr; }
        const info = await contract.getById(id);

        // Ethers returns result as array-like with named properties
        console.log('Contract Info:');
        console.log('----------------------------------------');
        console.log(`  ID:      ${info.contractId || info[0]}`);
        console.log(`  Name:    ${info.name || info[1]}`);
        console.log(`  Address: ${info.contractAddr || info[2]}`);
        console.log('----------------------------------------');

    } catch (error) {
        // Handle "Not found" revert
        if (error.message.includes("Not found") || (error.revert && error.revert.args && error.revert.args.join('').includes("Not found"))) {
            console.error(`Contract with ID ${args.id} not found in cluster.`);
        } else {
            console.error('Failed to get info:', error.message);
        }
        process.exit(1);
    }
};
