/**
 * 解除链接 (Unlink)
 * 仅用于已挂载合约 (whetherMounted == 1)
 * 调用: removeActivePodAfterMount / removePassivePodAfterMount
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

module.exports = async function unlink({ rootDir, args = {} }) {
    try {
        const { type, targetAddress, targetId } = args;

        if (type !== 'positive' && type !== 'passive') {
            throw new Error("Type must be 'positive' or 'passive'");
        }
        if (!ethers.isAddress(targetAddress)) {
            throw new Error("Invalid targetAddress");
        }
        const tId = Number(targetId);

        const config = loadProjectConfig(rootDir);
        const currentOperating = config.fsca?.currentOperating;

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
            console.warn(`Warning: Could not check whetherMounted. Assuming 0. ${e.message}`);
        }


        // if (isMounted == 0) {
        //     throw new Error("Cannot unlink via ClusterManager if contract is NOT mounted. Use direct contract calls or wait until mounted.");
        // }

        console.log(`Unlinking ${type} pod...`);
        console.log(`  Source: ${currentOperating}`);
        console.log(`  Target: ${targetAddress} (ID: ${tId})`);
        console.log(`  Status: ${isMounted == 1 ? 'Mounted' : 'Unmounted (Before Mount)'}`);

        const clusterAddr = config.fsca.clusterAddress;
        const clusterAbi = loadClusterManagerABI(rootDir);
        const clusterContract = new ethers.Contract(clusterAddr, clusterAbi, signer);

        let tx;
        if (isMounted == 1) {
            // After Mount
            if (type === 'positive') {
                tx = await clusterContract.removeActivePodAfterMount(currentOperating, targetAddress, tId);
            } else {
                tx = await clusterContract.removePassivePodAfterMount(currentOperating, targetAddress, tId);
            }
        } else {
            // Before Mount
            if (type === 'positive') {
                tx = await clusterContract.removeActivePodBeforeMount(currentOperating, targetAddress, tId);
            } else {
                tx = await clusterContract.removePassivePodBeforeMount(currentOperating, targetAddress, tId);
            }
        }

        console.log(`Transaction sent: ${tx.hash}`);
        console.log(`Waiting for confirmation...`);

        const receipt = await tx.wait();
        console.log(`✓ Transaction confirmed in block ${receipt.blockNumber}`);

        // Attempt parse logs
        try {
            let iface;
            if (ethers.Interface) {
                iface = new ethers.Interface(templateAbi);
            } else if (ethers.utils && ethers.utils.Interface) {
                iface = new ethers.utils.Interface(templateAbi);
            }

            if (iface) {
                for (const log of receipt.logs) {
                    try {
                        const parsed = iface.parseLog(log);
                        if (parsed && parsed.name === 'ModuleChanged') {
                            console.log(`  Event: ModuleChanged`);
                            console.log(`    Action: ${parsed.args[3]}`);
                        }
                    } catch (e) { }
                }
            }
        } catch (e) { }

    } catch (error) {
        console.error('Failed to unlink:', error.message);
        process.exit(1);
    }
};
