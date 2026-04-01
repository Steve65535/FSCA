/**
 * NormalTemplate 权限管理命令
 * arkheion normal right set <abiId> <maxRight>
 * arkheion normal right remove <abiId>
 * 
 * 注意：setAbiRight 和 removeAbiRight 有 onlyCluster 修饰符
 * 因此必须通过 ClusterManager.universalCall 进行调用
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

function loadNormalTemplateABI(rootDir) {
    // 尝试多个路径加载 ABI
    const possiblePaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'arkheion-core', 'lib', 'normaltemplate.sol', 'normalTemplate.json') // 假设 arkheion-core 在这
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
    }
    // Fallback: 如果没有 build，尝试从 libs/arkheion-core 构建或者报错?
    // 这里假设用户已经运行过 arkheion init 并且编译过
    throw new Error('NormalTemplate ABI not found. Please run "arkheion init" and ensure contracts are compiled.');
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

module.exports = async function right({ rootDir, args = {}, subcommands = [], commandName = '' }) {
    let lock;
    try {
        // 1. Determine action
        let action = subcommands[0]; // set or remove

        if (commandName) {
            const parts = commandName.split(' ');
            const lastPart = parts[parts.length - 1];
            if (['set', 'remove'].includes(lastPart)) {
                action = lastPart;
            }
        }
        if (!action || (action !== 'set' && action !== 'remove')) {
            throw new Error('Invalid action. Use "set" or "remove".');
        }

        const abiId = args.abiId || args.arg0;
        const maxRight = args.maxRight || args.arg1;

        if (!abiId) throw new Error("abiId is required.");
        if (action === 'set' && !maxRight) throw new Error("maxRight is required for set action.");

        const abiIdNum = Number(abiId);
        if (!Number.isInteger(abiIdNum) || abiIdNum < 0) {
            throw new Error('abiId must be a non-negative integer');
        }
        if (action === 'set') {
            const maxRightNum = Number(maxRight);
            if (!Number.isInteger(maxRightNum) || maxRightNum < 0) {
                throw new Error('maxRight must be a non-negative integer');
            }
        }

        // 2. Load Config
        const config = loadProjectConfig(rootDir);
        const currentOperating = config.arkheion?.currentOperating;
        const clusterAddress = config.arkheion?.clusterAddress;

        if (!currentOperating || !ethers.isAddress(currentOperating)) {
            throw new Error("No valid current operating contract. Run 'arkheion cluster choose <addr>' first.");
        }
        if (!clusterAddress || !ethers.isAddress(clusterAddress)) {
            throw new Error("Cluster address not found in config.");
        }

        console.log(`Managing ABI Right...`);
        console.log(`  Action: ${action.toUpperCase()}`);
        console.log(`  Target Contract: ${currentOperating}`);
        console.log(`  ABI ID: ${abiId}`);
        if (maxRight) console.log(`  Max Right: ${maxRight}`);

        // 3. Connect
        const provider = getProvider(config.network.rpc);
        const signer = getSigner(config.account.privateKey, provider);

        lock = await acquireLock(rootDir, clusterAddress, 'normal right');

        // 4. Prepare Calldata for NormalTemplate
        const normalInterface = new ethers.Interface(loadNormalTemplateABI(rootDir));
        let calldata;
        let abiName;

        if (action === 'set') {
            // setAbiRight(uint256 abiId, uint256 maxRight)
            calldata = normalInterface.encodeFunctionData("setAbiRight", [abiIdNum, Number(maxRight)]);
            abiName = "setAbiRight";
        } else {
            // removeAbiRight(uint256 abiId)
            calldata = normalInterface.encodeFunctionData("removeAbiRight", [abiIdNum]);
            abiName = "removeAbiRight";
        }

        // 5. Call ClusterManager.universalCall
        const clusterInterface = new ethers.Interface(loadClusterManagerABI(rootDir));
        const cluster = new ethers.Contract(clusterAddress, clusterInterface, signer);

        console.log(`  -> Sending via ClusterManager (${clusterAddress})...`);

        await sendTx(() => cluster.universalCall(currentOperating, abiName, calldata), { label: `normal:right:${abiName}` });
        console.log(`✓ Access Right updated successfully via Cluster.`);

    } catch (error) {
        console.error(`Failed to execute right ${args.action || ''}:`, error.message);
        if (process.env.DEBUG) console.error(error);
        process.exit(1);
    } finally {
        if (lock) lock.release();
    }
};
