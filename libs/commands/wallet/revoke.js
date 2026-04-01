/**
 * 撤销之前的确认
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

module.exports = async function revoke({ rootDir, args = {} }) {
    let lock;
    try {
        const { txIndex } = args;

        if (!Number.isInteger(txIndex) || txIndex < 0) {
            throw new Error('Invalid transaction index: must be a non-negative integer');
        }

        const ok = await confirm(`Revoke confirmation for transaction #${txIndex}?`, !!args.yes);
        if (!ok) { console.log('Aborted.'); return; }

        console.log(`${logger.COLORS.brightBlue}Revoking confirmation for transaction #${txIndex}...${logger.COLORS.reset}`);
        console.log('');

        // 1. Load config
        const config = loadProjectConfig(rootDir);

        const multiSigAddress = config.arkheion?.multisigAddress || config.arkheion?.multiSigAddress;
        if (!multiSigAddress || multiSigAddress === '0x') {
            throw new Error('MultiSig wallet address not found in project.json.');
        }
        const provider = chainProvider.getProvider(config.network.rpc);
        const signer = walletSigner.getSigner(config.account?.privateKey, provider);

        lock = await acquireLock(rootDir, multiSigAddress, 'wallet revoke');

        // 2. Load ABI and connect
        const multiSigABI = loadMultiSigABI(rootDir);
        const multiSigWallet = new ethers.Contract(multiSigAddress, multiSigABI, signer);

        // 3. Check if confirmed
        const isConfirmed = await multiSigWallet.isConfirmed(txIndex, signer.address);
        if (!isConfirmed) {
            console.log(`${logger.COLORS.brightYellow}⚠ You have not confirmed this transaction.${logger.COLORS.reset}`);
            return;
        }

        // 4. Revoke confirmation
        await sendTx(() => multiSigWallet.revokeConfirmation(txIndex), { label: `revoke:${txIndex}` });

        // 5. Get updated transaction info
        const threshold = await multiSigWallet.numConfirmationsRequired();
        const validConfirmations = await multiSigWallet.getValidConfirmations(txIndex);

        console.log('');
        console.log(`${logger.COLORS.brightGreen}✓ Confirmation revoked!${logger.COLORS.reset}`);
        console.log('');
        console.log(`${logger.COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Confirmations:${logger.COLORS.reset} ${logger.COLORS.brightGreen}${validConfirmations}${logger.COLORS.reset}/${logger.COLORS.brightGreen}${threshold}${logger.COLORS.reset}                                         ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${logger.COLORS.reset}`);
        console.log('');

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to revoke confirmation:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    } finally {
        if (lock) lock.release();
    }
};
