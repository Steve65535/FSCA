/**
 * 查看所有所有者和阈值
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

module.exports = async function owners({ rootDir, args = {} }) {
    try {
        console.log(`${logger.COLORS.brightBlue}Querying MultiSig wallet owners...${logger.COLORS.reset}`);
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

        // 3. Get owners and threshold
        const owners = await multiSigWallet.getOwners();
        const threshold = await multiSigWallet.numConfirmationsRequired();

        // 4. Display
        console.log(`${logger.COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.bold}${logger.COLORS.brightBlue}MultiSig Wallet Owners${logger.COLORS.reset}                                     ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}╠═══════════════════════════════════════════════════════════════╣${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Wallet:${logger.COLORS.reset}    ${multiSigAddress.slice(0, 20)}...                ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Threshold:${logger.COLORS.reset} ${logger.COLORS.brightGreen}${threshold}${logger.COLORS.reset}/${logger.COLORS.brightGreen}${owners.length}${logger.COLORS.reset}                                                ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}╠═══════════════════════════════════════════════════════════════╣${logger.COLORS.reset}`);
        console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Owners:${logger.COLORS.reset}                                                       ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);

        owners.forEach((owner, index) => {
            console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}    ${logger.COLORS.brightGreen}${index + 1}.${logger.COLORS.reset} ${owner}                  ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
        });

        console.log(`${logger.COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${logger.COLORS.reset}`);
        console.log('');

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to get owners:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};
