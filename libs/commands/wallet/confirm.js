/**
 * 确认待处理的交易
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const logger = require('../../logger');
const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found. Please run "fsca init" first.');
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

module.exports = async function confirm({ rootDir, args = {} }) {
    try {
        const { txIndex } = args;

        if (txIndex === undefined || txIndex < 0) {
            throw new Error('Invalid transaction index');
        }

        console.log(`${logger.COLORS.brightBlue}Confirming transaction #${txIndex}...${logger.COLORS.reset}`);
        console.log('');

        // 1. Load config
        const config = loadProjectConfig(rootDir);

        if (!config.fsca?.multiSigAddress) {
            throw new Error('MultiSig wallet address not found in project.json.');
        }

        const multiSigAddress = config.fsca.multiSigAddress;
        const provider = chainProvider.getProvider(config.network.rpc);
        const signer = walletSigner.getSigner(config.account?.privateKey, provider);

        // 2. Load ABI and connect
        const multiSigABI = loadMultiSigABI(rootDir);
        const multiSigWallet = new ethers.Contract(multiSigAddress, multiSigABI, signer);

        // 3. Check if already confirmed
        const isAlreadyConfirmed = await multiSigWallet.isConfirmed(txIndex, signer.address);
        if (isAlreadyConfirmed) {
            console.log(`${logger.COLORS.brightYellow}⚠ You have already confirmed this transaction.${logger.COLORS.reset}`);
            return;
        }

        // 4. Confirm transaction
        const tx = await multiSigWallet.confirmTransaction(txIndex);

        console.log(`${logger.COLORS.brightYellow}Transaction sent: ${tx.hash}${logger.COLORS.reset}`);
        console.log('Waiting for confirmation...');

        await tx.wait();

        // 5. Get updated transaction info
        const transaction = await multiSigWallet.transactions(txIndex);
        const threshold = await multiSigWallet.numConfirmationsRequired();

        console.log('');
        console.log(`${logger.COLORS.brightGreen}✓ Transaction confirmed!${logger.COLORS.reset}`);
        console.log('');
        console.log(`${logger.COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Confirmations:${logger.COLORS.reset} ${logger.COLORS.brightGreen}${transaction.numConfirmations}${logger.COLORS.reset}/${logger.COLORS.brightGreen}${threshold}${logger.COLORS.reset}                                         ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${logger.COLORS.reset}`);
        console.log('');

        if (transaction.numConfirmations >= threshold) {
            console.log(`${logger.COLORS.brightGreen}✓ Transaction is ready to execute!${logger.COLORS.reset}`);
            console.log(`  Run: ${logger.COLORS.brightBlue}fsca wallet execute ${txIndex}${logger.COLORS.reset}`);
        } else {
            const remaining = threshold - transaction.numConfirmations;
            console.log(`${logger.COLORS.brightYellow}⏳ Waiting for ${remaining} more confirmation(s)${logger.COLORS.reset}`);
        }
        console.log('');

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to confirm transaction:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};
