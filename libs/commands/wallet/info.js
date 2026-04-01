/**
 * 查看交易详情
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const logger = require('../../logger');
const chainProvider = require('../../../chain/provider');

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found. Please run "arkheion init" first.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function loadMultiSigABI(rootDir) {
    const possiblePaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'wallet', 'multisigwallet.sol', 'MultiSigWallet.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'wallet', 'multisigwallet.sol', 'MultiSigWallet.json'),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
        }
    }

    throw new Error('MultiSigWallet ABI not found. Please compile contracts first.');
}

module.exports = async function info({ rootDir, args = {} }) {
    try {
        const { txIndex } = args;

        if (!Number.isInteger(txIndex) || txIndex < 0) {
            throw new Error('Invalid transaction index: must be a non-negative integer');
        }

        console.log(`${logger.COLORS.brightBlue}Querying transaction #${txIndex}...${logger.COLORS.reset}`);
        console.log('');

        // 1. Load config
        const config = loadProjectConfig(rootDir);

        const multiSigAddress = config.arkheion?.multisigAddress || config.arkheion?.multiSigAddress;
        if (!multiSigAddress || multiSigAddress === '0x') {
            throw new Error('MultiSig wallet address not found in project.json.');
        }
        const provider = chainProvider.getProvider(config.network.rpc);

        // 2. Load ABI and connect
        const multiSigABI = loadMultiSigABI(rootDir);
        const multiSigWallet = new ethers.Contract(multiSigAddress, multiSigABI, provider);

        // 3. Get transaction and owners
        const tx = await multiSigWallet.transactions(txIndex);
        const threshold = await multiSigWallet.numConfirmationsRequired();
        const owners = await multiSigWallet.getOwners();
        const validConfirmations = await multiSigWallet.getValidConfirmations(txIndex);

        // 4. Check who confirmed
        const confirmations = [];
        for (const owner of owners) {
            const confirmed = await multiSigWallet.isConfirmed(txIndex, owner);
            confirmations.push({ owner, confirmed });
        }

        // 5. Display
        console.log(`${logger.COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.bold}${logger.COLORS.brightBlue}Transaction #${txIndex}${logger.COLORS.reset}                                              ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}╠═══════════════════════════════════════════════════════════════╣${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}To:${logger.COLORS.reset}        ${tx.to}                  ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Value:${logger.COLORS.reset}     ${ethers.formatEther(tx.value)} ETH                                     ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Data:${logger.COLORS.reset}      ${tx.data.slice(0, 20)}...${tx.data.slice(-10)}                ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);

        const statusColor = tx.executed ? logger.COLORS.brightGreen : logger.COLORS.brightYellow;
        const statusText = tx.executed ? 'EXECUTED' : 'PENDING';
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Status:${logger.COLORS.reset}    ${statusColor}${statusText}${logger.COLORS.reset}                                          ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Confirms:${logger.COLORS.reset}  ${logger.COLORS.brightGreen}${validConfirmations}${logger.COLORS.reset}/${logger.COLORS.brightGreen}${threshold}${logger.COLORS.reset}                                                ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}╠═══════════════════════════════════════════════════════════════╣${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Confirmations:${logger.COLORS.reset}                                                ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);

        confirmations.forEach(({ owner, confirmed }) => {
            const icon = confirmed ? `${logger.COLORS.brightGreen}✓${logger.COLORS.reset}` : `${logger.COLORS.brightYellow}○${logger.COLORS.reset}`;
            const shortAddr = owner.slice(0, 10) + '...' + owner.slice(-6);
            console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}    ${icon} ${shortAddr}                                       ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        });

        console.log(`${logger.COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${logger.COLORS.reset}`);
        console.log('');

        // 6. Next steps
        if (!tx.executed) {
            if (validConfirmations >= threshold) {
                console.log(`${logger.COLORS.brightGreen}✓ Ready to execute!${logger.COLORS.reset}`);
                console.log(`  Run: ${logger.COLORS.brightBlue}arkheion wallet execute ${txIndex}${logger.COLORS.reset}`);
            } else {
                const remaining = threshold - validConfirmations;
                console.log(`${logger.COLORS.brightYellow}⏳ Waiting for ${remaining} more confirmation(s)${logger.COLORS.reset}`);
                console.log(`  Run: ${logger.COLORS.brightBlue}arkheion wallet confirm ${txIndex}${logger.COLORS.reset}`);
            }
            console.log('');
        }

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to get transaction info:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};
