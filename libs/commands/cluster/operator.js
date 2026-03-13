/**
 * Cluster Operator 管理
 * fsca cluster operator list
 * fsca cluster operator add <address>
 * fsca cluster operator remove <address>
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

module.exports = async function operator({ rootDir, args = {}, subcommands = [], commandName = '' }) {
    try {
        let action = subcommands[0]; // default fallback

        // Prefer extracting action from commandName (e.g. "cluster operator list" -> "list")
        if (commandName) {
            const parts = commandName.split(' ');
            const lastPart = parts[parts.length - 1];
            if (['list', 'add', 'remove'].includes(lastPart)) {
                action = lastPart;
            }
        }

        // Load Config
        const config = loadProjectConfig(rootDir);
        const clusterAddress = config.fsca?.clusterAddress;

        if (!clusterAddress || !ethers.isAddress(clusterAddress)) {
            throw new Error("Cluster address not configured.");
        }

        const provider = getProvider(config.network.rpc);
        const abi = loadClusterManagerABI(rootDir);

        // For list we only need provider, for add/remove we need signer
        let contract;
        if (action === 'list') {
            contract = new ethers.Contract(clusterAddress, abi, provider);
            console.log(`Querying operators from cluster ${clusterAddress}...`);
            const operators = await contract.getAllOperators();

            if (operators.length === 0) {
                console.log('No operators found (except Root Admin).');
            } else {
                console.log(`${operators.length} Operator(s) found:`);
                operators.forEach((op, idx) => {
                    console.log(`  [${idx + 1}] ${op}`);
                });
            }

        } else if (action === 'add' || action === 'remove') {
            const signer = getSigner(config.account.privateKey, provider);
            contract = new ethers.Contract(clusterAddress, abi, signer);

            const targetAddr = args.address || args.arg0;
            if (!targetAddr || !ethers.isAddress(targetAddr)) {
                throw new Error("Valid address is required.");
            }

            if (action === 'add') {
                console.log(`Adding operator ${targetAddr}...`);
                const tx = await contract.addOperator(targetAddr);
                console.log(`Transaction sent: ${tx.hash}`);
                await tx.wait();
                console.log('✓ Operator added.');
            } else {
                console.log(`Removing operator ${targetAddr}...`);
                const tx = await contract.removeOperator(targetAddr);
                console.log(`Transaction sent: ${tx.hash}`);
                await tx.wait();
                console.log('✓ Operator removed.');
            }
        } else {
            throw new Error("Unknown action. Use list, add, or remove.");
        }

    } catch (error) {
        console.error('Operator command failed:', error.message);
        process.exit(1);
    }
};
