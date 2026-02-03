/**
 * 显示当前操作的合约信息
 * 读取 project.json 中的 currentOperating 并显示详细信息
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found. Please run "fsca init" first.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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

module.exports = async function current({ rootDir, args = {} }) {
    try {
        const config = loadProjectConfig(rootDir);
        const currentAddr = config.fsca?.currentOperating;

        if (!currentAddr) {
            console.log(`${logger.COLORS.brightYellow}No contract currently selected.${logger.COLORS.reset}`);
            console.log('');
            console.log(`Use ${logger.COLORS.brightBlue}fsca cluster choose <address>${logger.COLORS.reset} to select a contract.`);
            console.log(`Or ${logger.COLORS.brightBlue}fsca deploy "ContractName"${logger.COLORS.reset} to deploy a new one.`);
            return;
        }

        const metadata = findContractMetadata(config, currentAddr);
        const { COLORS } = logger;

        console.log('');
        console.log(`${COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${COLORS.reset}`);
        console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.bold}${COLORS.brightBlue}Current Operating Contract${COLORS.reset}                              ${COLORS.brightPurple}║${COLORS.reset}`);
        console.log(`${COLORS.brightPurple}╠═══════════════════════════════════════════════════════════════╣${COLORS.reset}`);

        // 地址
        console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Address:${COLORS.reset}  ${COLORS.brightGreen}${currentAddr}${COLORS.reset}`);

        // 名称
        if (metadata?.name) {
            console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Name:${COLORS.reset}     ${COLORS.brightBlue}${metadata.name}${COLORS.reset}`);
        }

        // ID
        if (metadata?.contractId) {
            console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}ID:${COLORS.reset}       ${COLORS.brightGreen}${metadata.contractId}${COLORS.reset}`);
        }

        // 状态
        if (metadata?.status) {
            const statusColor = metadata.status === 'MOUNTED' ? COLORS.brightGreen : COLORS.brightYellow;
            const statusIcon = metadata.status === 'MOUNTED' ? '✓' : '○';
            console.log(`${COLORS.brightPurple}║${COLORS.reset}  ${COLORS.brightYellow}Status:${COLORS.reset}   ${statusColor}${statusIcon} ${metadata.status}${COLORS.reset}`);
        }

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

        // 提示
        if (metadata?.status === 'UNMOUNTED') {
            console.log(`${COLORS.brightYellow}💡 Tip: Use 'fsca cluster mount <id> <name>' to mount this contract.${COLORS.reset}`);
        } else if (metadata?.status === 'MOUNTED') {
            console.log(`${COLORS.brightGreen}✓ This contract is active and ready for operations.${COLORS.reset}`);
        }
        console.log('');

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to get current contract:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};
