/**
 * 列出所有交易
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

module.exports = async function list({ rootDir, args = {} }) {
    try {
        const { pending } = args;

        console.log(`${logger.COLORS.brightBlue}Listing ${pending ? 'pending ' : ''}transactions...${logger.COLORS.reset}`);
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

        // 3. Get transaction count and threshold
        const txCount = await multiSigWallet.transactionCount();
        const threshold = await multiSigWallet.numConfirmationsRequired();

        if (txCount == 0) {
            console.log(`${logger.COLORS.brightYellow}No transactions found.${logger.COLORS.reset}`);
            return;
        }

        // 4. Fetch all transactions
        const transactions = [];
        for (let i = 0; i < txCount; i++) {
            const tx = await multiSigWallet.transactions(i);

            // Filter if pending only
            if (pending && tx.executed) {
                continue;
            }

            const validConfirmations = await multiSigWallet.getValidConfirmations(i);

            transactions.push({
                index: i,
                to: tx.to,
                value: tx.value,
                executed: tx.executed,
                confirmations: validConfirmations
            });
        }

        if (transactions.length === 0) {
            console.log(`${logger.COLORS.brightYellow}No ${pending ? 'pending ' : ''}transactions found.${logger.COLORS.reset}`);
            return;
        }

        // 5. Display table
        console.log(`${logger.COLORS.brightPurple}┌─────┬──────────────────────┬───────────┬──────────┬─────────────┐${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${logger.COLORS.bold}ID${logger.COLORS.reset}  ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${logger.COLORS.bold}To${logger.COLORS.reset}                   ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${logger.COLORS.bold}Value${logger.COLORS.reset}     ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${logger.COLORS.bold}Status${logger.COLORS.reset}   ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${logger.COLORS.bold}Confirms${logger.COLORS.reset}    ${logger.COLORS.brightPurple}│${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}├─────┼──────────────────────┼───────────┼──────────┼─────────────┤${logger.COLORS.reset}`);

        transactions.forEach(tx => {
            const shortAddr = tx.to.slice(0, 10) + '...' + tx.to.slice(-6);
            const valueEth = ethers.formatEther(tx.value);
            const status = tx.executed ?
                `${logger.COLORS.brightGreen}Executed${logger.COLORS.reset}` :
                (tx.confirmations >= threshold ?
                    `${logger.COLORS.brightBlue}Ready${logger.COLORS.reset}   ` :
                    `${logger.COLORS.brightYellow}Pending${logger.COLORS.reset} `);
            const confirms = `${tx.confirmations}/${threshold}`;

            console.log(`${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${tx.index.toString().padEnd(3)} ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${shortAddr} ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${valueEth.padEnd(9)} ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${status} ${logger.COLORS.brightPurple}│${logger.COLORS.reset} ${confirms.padEnd(11)} ${logger.COLORS.brightPurple}│${logger.COLORS.reset}`);
        });

        console.log(`${logger.COLORS.brightPurple}└─────┴──────────────────────┴───────────┴──────────┴─────────────┘${logger.COLORS.reset}`);
        console.log('');
        console.log(`${logger.COLORS.brightYellow}Tip:${logger.COLORS.reset} Use ${logger.COLORS.brightBlue}arkheion wallet info <txIndex>${logger.COLORS.reset} to view details`);
        console.log('');

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to list transactions:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};
