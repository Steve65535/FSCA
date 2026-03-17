/**
 * 选择当前操作的合约
 * 1. 更新 project.json 中的 currentOperating 字段
 * 2. 检查合约是否在集群中注册
 * 3. 检查合约的 whetherMounted 状态
 * 4. 显示彩色的合约信息
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const logger = require('../../logger');
const credentials = require('../../../wallet/credentials');

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
    const rpcUrl = credentials.resolveRpcUrl(config, rootDir);

    if (!rpcUrl) {
        throw new Error('Network RPC URL not configured (set FSCA_RPC_URL or network.rpc in project.json)');
    }

    if (!config.fsca || !config.fsca.clusterAddress) {
        throw new Error('ClusterManager address not found in project.json. Please run "fsca cluster init" first.');
    }

    config.network = config.network || {};
    config.network.rpc = rpcUrl;
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
        path.join(rootDir, 'artifacts', 'contracts', 'core', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
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
 * 加载 NormalTemplate ABI (为了检查 whetherMounted)
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
        "function whetherMounted() view returns (uint8)"
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

/**
 * 从缓存中查找合约元数据
 */
function findContractMetadata(config, address) {
    const addr = address.toLowerCase();

    // 先在 runningcontracts 中查找
    if (config.fsca?.runningcontracts) {
        const found = config.fsca.runningcontracts.find(
            c => c.address.toLowerCase() === addr
        );
        if (found) return { ...found, status: 'MOUNTED' };
    }

    // 再在 unmountedcontracts 中查找
    if (config.fsca?.unmountedcontracts) {
        const found = config.fsca.unmountedcontracts.find(
            c => c.address.toLowerCase() === addr
        );
        if (found) return { ...found, status: 'UNMOUNTED' };
    }

    // 最后在 alldeployedcontracts 中查找
    if (config.fsca?.alldeployedcontracts) {
        const found = config.fsca.alldeployedcontracts.find(
            c => c.address.toLowerCase() === addr
        );
        if (found) return { ...found, status: 'UNKNOWN' };
    }

    return null;
}

/**
 * 显示彩色的合约信息卡片
 */
function displayContractInfo(address, metadata, clusterStatus, mountStatus) {
    const { COLORS } = logger;

    console.log('');
    console.log(`${COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.bold}${COLORS.brightBlue}Current Operating Contract${COLORS.reset}                              ${COLORS.brightPurple}║${COLORS.reset}`);
    console.log(`${COLORS.brightPurple}╠═══════════════════════════════════════════════════════════════╣${COLORS.reset}`);

    // 地址
    console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Address:${COLORS.reset}  ${COLORS.brightGreen}${address}${COLORS.reset}`);

    // 名称
    if (metadata?.name || clusterStatus?.name) {
        const name = metadata?.name || clusterStatus?.name;
        console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Name:${COLORS.reset}     ${COLORS.brightBlue}${name}${COLORS.reset}`);
    }

    // ID
    if (clusterStatus?.found) {
        console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}ID:${COLORS.reset}       ${COLORS.brightGreen}${clusterStatus.id}${COLORS.reset}`);
    } else if (metadata?.contractId) {
        console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}ID:${COLORS.reset}       ${COLORS.brightGreen}${metadata.contractId}${COLORS.reset}`);
    }

    // 状态
    const statusColor = mountStatus == 1 ? COLORS.brightGreen : COLORS.brightYellow;
    const statusText = mountStatus == 1 ? '✓ MOUNTED' : '○ NOT MOUNTED';
    console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Status:${COLORS.reset}   ${statusColor}${statusText}${COLORS.reset}`);

    // 部署时间
    if (metadata?.timeStamp) {
        const date = new Date(metadata.timeStamp * 1000).toLocaleString();
        console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Deployed:${COLORS.reset} ${date}`);
    }

    // 部署交易
    if (metadata?.deployTx) {
        const shortTx = metadata.deployTx.slice(0, 10) + '...' + metadata.deployTx.slice(-8);
        console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Tx:${COLORS.reset}       ${shortTx}`);
    }

    console.log(`${COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${COLORS.reset}`);
    console.log('');
}

module.exports = async function choose({ rootDir, args = {} }) {
    try {
        const targetAddr = args.address || args.arg0;
        if (!ethers.isAddress(targetAddr)) {
            throw new Error(`Invalid address: ${targetAddr}`);
        }

        console.log(`${logger.COLORS.brightBlue}Selecting contract: ${targetAddr}${logger.COLORS.reset}`);
        console.log('');

        // 1. Update config
        updateCurrentOperating(rootDir, targetAddr);

        // 2. Load Config & Provider
        const config = loadProjectConfig(rootDir);
        const provider = getProvider(config.network.rpc);

        // 3. Find metadata from cache
        const metadata = findContractMetadata(config, targetAddr);

        // 4. Connect to ClusterManager
        const clusterAbi = loadClusterManagerABI(rootDir);
        const clusterContract = new ethers.Contract(config.fsca.clusterAddress, clusterAbi, provider);

        // 5. Check if in cluster
        console.log(`${logger.COLORS.brightYellow}Querying cluster status...${logger.COLORS.reset}`);
        const clusterStatus = await checkInCluster(clusterContract, targetAddr);

        // 6. Check whetherMounted
        console.log(`${logger.COLORS.brightYellow}Checking mount status...${logger.COLORS.reset}`);
        const templateAbi = loadNormalTemplateABI(rootDir);
        const targetContract = new ethers.Contract(targetAddr, templateAbi, provider);

        let mountStatus = null;
        try {
            mountStatus = await targetContract.whetherMounted();
        } catch (e) {
            console.warn(`${logger.COLORS.brightYellow}⚠ Could not read whetherMounted status${logger.COLORS.reset}`);
        }

        // 7. Display beautiful contract info
        displayContractInfo(targetAddr, metadata, clusterStatus, mountStatus);

        // 8. Additional tips
        if (!clusterStatus.found) {
            console.log(`${logger.COLORS.brightYellow}💡 Tip: Contract not found in cluster. Use 'fsca cluster mount' to register it.${logger.COLORS.reset}`);
        } else if (mountStatus == 0) {
            console.log(`${logger.COLORS.brightYellow}💡 Tip: Contract is not mounted. You can use 'fsca cluster link' to configure links.${logger.COLORS.reset}`);
        } else if (mountStatus == 1) {
            console.log(`${logger.COLORS.brightGreen}✓ Contract is active and ready for operations.${logger.COLORS.reset}`);
        }
        console.log('');

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to choose contract:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};

/**
 * 导出辅助函数供其他命令使用
 */
module.exports.displayCurrentContract = function (config) {
    const currentAddr = config.fsca?.currentOperating;
    if (!currentAddr) {
        return;
    }

    const metadata = findContractMetadata(config, currentAddr);
    const { COLORS } = logger;

    console.log(`${COLORS.brightPurple}┌─ Current Contract ─────────────────────────────────────────┐${COLORS.reset}`);
    console.log(`${COLORS.brightPurple}│${COLORS.reset} ${COLORS.brightGreen}${currentAddr}${COLORS.reset}`);
    if (metadata?.name) {
        console.log(`${COLORS.brightPurple}│${COLORS.reset} ${COLORS.brightBlue}${metadata.name}${COLORS.reset} ${metadata.contractId ? `(ID: ${metadata.contractId})` : ''}`);
    }
    console.log(`${COLORS.brightPurple}└────────────────────────────────────────────────────────────┘${COLORS.reset}`);
    console.log('');
};
