/**
 * 选择当前操作的合约
 * 1. 更新 project.json 中的 currentOperating 字段
 * 2. 检查合约是否在集群中注册
 * 3. 检查合约的 wetherMounted 状态
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// 加载 chain 目录下的封装函数
const chainProvider = require('../../../chain/provider');
const getProvider = chainProvider.getProvider;

/**
 * 加载项目配置
 * @param {string} rootDir - 项目根目录
 * @returns {Object} 配置对象
 */
function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found. Please run "fsca init" first.');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!config.network || !config.network.rpc) {
        throw new Error('Network RPC URL not configured in project.json');
    }

    if (!config.fsca || !config.fsca.clusterAddress) {
        throw new Error('ClusterManager address not found in project.json. Please run "fsca cluster init" first.');
    }

    return config;
}

/**
 * 更新项目配置中的 currentOperating
 * @param {string} rootDir 
 * @param {string} address 
 */
function updateCurrentOperating(rootDir, address) {
    const configPath = path.join(rootDir, 'project.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (!config.fsca) {
        config.fsca = {};
    }

    config.fsca.currentOperating = address;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`Updated currentOperating to ${address} in project.json`);
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

    for (const artifactPath of artifactPaths) {
        if (fs.existsSync(artifactPath)) {
            const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
            return artifact.abi;
        }
    }

    throw new Error('ClusterManager ABI not found. Please compile contracts first.');
}

/**
 * 加载 NormalTemplate ABI (为了检查 wetherMounted)
 */
function loadNormalTemplateABI(rootDir) {
    // 尝试查找 normalTemplate Artifact
    // 路径大概是 artifacts/contracts/undeployed/lib/normaltemplate.sol/normalTemplate.json
    const possiblePaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normalTemplate.sol', 'normalTemplate.json'), // 这里的 filename 大小写可能不确定
        path.join(rootDir, 'artifacts', 'contracts', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
        }
    }

    // 如果找不到，我们可以构造一个最小 ABI
    console.warn("Could not find normalTemplate ABI json, using minimal ABI.");
    return [
        "function wetherMounted() view returns (uint8)"
    ];
}


/**
 * 检查合约是否在集群中
 * @param {ethers.Contract} clusterContract 
 * @param {string} targetAddr 
 */
async function checkInCluster(clusterContract, targetAddr) {
    // ClusterManager 没有 public 的 addrToId.
    // 我们必须遍历 contractRegistrations 吗？ 或者如果我们是 operator 可以用某些方法？
    // 这里的 workaround 是: 遍历 allRegistrations 或者 contractRegistrations.
    // 为了性能，我们先假设用户输入是对的，或者只检查前 N 个？
    // 为了准确性，我们应该遍历 list.js 中的 getArrayLength 逻辑.

    // 事实上，如果 addrToId 是 private，且没有 getter，我们很难高效检查。
    // 但是 list.js 里已经实现了 listing.
    // 让我们试着遍历 contractRegistrations

    console.log("Checking if contract is in cluster (scanning registrations)...");

    // 二分法找长度
    let low = 0;
    let high = 10000;
    let length = 0;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        try {
            await clusterContract.contractRegistrations(mid);
            length = mid + 1;
            low = mid + 1;
        } catch (e) {
            high = mid - 1;
        }
    }

    for (let i = 0; i < length; i++) {
        try {
            const reg = await clusterContract.contractRegistrations(i);
            // reg: [contractId, name, contractAddr]
            if (reg.contractAddr.toLowerCase() === targetAddr.toLowerCase()) {
                return { found: true, id: reg.contractId, name: reg.name };
            }
        } catch (e) { continue; }
    }

    return { found: false };
}

module.exports = async function choose({ rootDir, args = {} }) {
    try {
        const targetAddr = args.address;
        if (!ethers.isAddress(targetAddr)) {
            throw new Error(`Invalid address: ${targetAddr}`);
        }

        // 1. Update config
        updateCurrentOperating(rootDir, targetAddr);

        // 2. Load Config & Provider
        const config = loadProjectConfig(rootDir);
        const provider = getProvider(config.network.rpc);

        // 3. Connect to ClusterManager
        const clusterAbi = loadClusterManagerABI(rootDir);
        const clusterContract = new ethers.Contract(config.fsca.clusterAddress, clusterAbi, provider);

        // 4. Check if in cluster
        const clusterStatus = await checkInCluster(clusterContract, targetAddr);

        if (clusterStatus.found) {
            console.log(`✓ Contract found in cluster.`);
            console.log(`  Name: ${clusterStatus.name}`);
            console.log(`  ID: ${clusterStatus.id}`);
        } else {
            console.log(`! Contract NOT found in active contractRegistrations.`);
            console.log(`  (It might be deleted or not registered yet)`);
        }

        // 5. Check wetherMounted
        console.log(`Checking wetherMounted status on ${targetAddr}...`);
        const templateAbi = loadNormalTemplateABI(rootDir);
        const targetContract = new ethers.Contract(targetAddr, templateAbi, provider);

        try {
            const isMounted = await targetContract.wetherMounted();
            console.log(`  wetherMounted: ${isMounted} (${isMounted == 1 ? 'MOUNTED' : 'NOT MOUNTED'})`);

            if (isMounted == 0) {
                console.log("");
                console.log("Tip: Contract is not mounted. You can use 'fsca cluster link' to link it.");
            }
        } catch (e) {
            console.log(`  ! Failed to read wetherMounted. Is this a compatible contract?`);
            console.log(`  Error: ${e.message}`);
        }

    } catch (error) {
        console.error('Failed to choose contract:', error.message);
        process.exit(1);
    }
};
