/**
 * 执行已达到阈值的交易
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const logger = require('../../logger');
const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');
const { sendTx } = require('../txExecutor');
const { acquireLock } = require('../clusterLock');

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

const { confirm } = require('../confirm');

module.exports = async function execute({ rootDir, args = {} }) {
    let lock;
    try {
        const { txIndex } = args;

        if (!Number.isInteger(txIndex) || txIndex < 0) {
            throw new Error('Invalid transaction index: must be a non-negative integer');
        }

        const ok = await confirm(`Execute transaction #${txIndex} on-chain?`, !!args.yes);
        if (!ok) { console.log('Aborted.'); return; }

        console.log(`${logger.COLORS.brightBlue}Executing transaction #${txIndex}...${logger.COLORS.reset}`);
        console.log('');

        // 1. Load config
        const config = loadProjectConfig(rootDir);

        const multiSigAddress = config.arkheion?.multisigAddress || config.arkheion?.multiSigAddress;
        if (!multiSigAddress || multiSigAddress === '0x') {
            throw new Error('MultiSig wallet address not found in project.json.');
        }
        const provider = chainProvider.getProvider(config.network.rpc);
        const signer = walletSigner.getSigner(config.account?.privateKey, provider);

        lock = await acquireLock(rootDir, multiSigAddress, 'wallet execute');

        // 2. Load ABI and connect
        const multiSigABI = loadMultiSigABI(rootDir);
        const multiSigWallet = new ethers.Contract(multiSigAddress, multiSigABI, signer);

        // 3. Check transaction status
        const transaction = await multiSigWallet.transactions(txIndex);
        const threshold = await multiSigWallet.numConfirmationsRequired();
        const validConfirmations = await multiSigWallet.getValidConfirmations(txIndex);

        if (transaction.executed) {
            console.log(`${logger.COLORS.brightYellow}⚠ Transaction already executed.${logger.COLORS.reset}`);
            return;
        }

        if (validConfirmations < threshold) {
            console.log(`${logger.COLORS.brightYellow}⚠ Transaction does not have enough confirmations.${logger.COLORS.reset}`);
            console.log(`  Current: ${validConfirmations}/${threshold}`);
            console.log(`  Need ${threshold - validConfirmations} more confirmation(s)`);
            return;
        }

        // 4. Execute transaction
        console.log(`${logger.COLORS.brightYellow}Executing transaction...${logger.COLORS.reset}`);
        await sendTx(() => multiSigWallet.executeTransaction(txIndex), { label: `execute:${txIndex}` });

        console.log('');
        console.log(`${logger.COLORS.brightGreen}✓ Transaction executed successfully!${logger.COLORS.reset}`);
        console.log('');
        console.log(`${logger.COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Transaction #${txIndex}:${logger.COLORS.reset} ${logger.COLORS.brightGreen}EXECUTED${logger.COLORS.reset}                                  ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Target:${logger.COLORS.reset}         ${transaction.to.slice(0, 20)}...                ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${logger.COLORS.reset}`);
        console.log('');

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to execute transaction:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    } finally {
        if (lock) lock.release();
    }
};
