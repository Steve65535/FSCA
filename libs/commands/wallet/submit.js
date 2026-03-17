/**
 * 提交新交易到 MultiSig 钱包
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

module.exports = async function submit({ rootDir, args = {} }) {
    try {
        const { to, value = '0', data } = args;

        if (!ethers.isAddress(to)) {
            throw new Error(`Invalid target address: ${to}`);
        }

        if (!data || !data.startsWith('0x')) {
            throw new Error(`Invalid data: must be hex string starting with 0x`);
        }

        console.log(`${logger.COLORS.brightBlue}Submitting transaction to MultiSig wallet...${logger.COLORS.reset}`);
        console.log('');

        // 1. Load config
        const config = loadProjectConfig(rootDir);

        if (!config.fsca?.multiSigAddress) {
            throw new Error('MultiSig wallet address not found in project.json. Please run "fsca cluster init" first.');
        }

        const multiSigAddress = config.fsca.multiSigAddress;
        const provider = chainProvider.getProvider(config.network.rpc);
        const signer = walletSigner.getSigner(config.account?.privateKey, provider);

        // 2. Load ABI and connect
        const multiSigABI = loadMultiSigABI(rootDir);
        const multiSigWallet = new ethers.Contract(multiSigAddress, multiSigABI, signer);

        // 3. Submit transaction
        console.log(`${logger.COLORS.brightYellow}Transaction Details:${logger.COLORS.reset}`);
        console.log(`  To:    ${logger.COLORS.brightGreen}${to}${logger.COLORS.reset}`);
        console.log(`  Value: ${logger.COLORS.brightGreen}${value} ETH${logger.COLORS.reset}`);
        console.log(`  Data:  ${data.slice(0, 20)}...${data.slice(-10)}`);
        console.log('');

        const valueWei = ethers.parseEther(value);
        const tx = await multiSigWallet.submitTransaction(to, valueWei, data);

        console.log(`${logger.COLORS.brightYellow}Transaction sent: ${tx.hash}${logger.COLORS.reset}`);
        console.log('Waiting for confirmation...');

        const receipt = await tx.wait();

        // 4. Parse event to get txIndex
        const submitEvent = receipt.logs
            .map(log => {
                try {
                    return multiSigWallet.interface.parseLog(log);
                } catch (e) {
                    return null;
                }
            })
            .find(event => event && event.name === 'SubmitTransaction');

        if (submitEvent) {
            const txIndex = submitEvent.args.txIndex;
            console.log('');
            console.log(`${logger.COLORS.brightGreen}✓ Transaction submitted successfully!${logger.COLORS.reset}`);
            console.log('');
            console.log(`${logger.COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${logger.COLORS.reset}`);
            console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.bold}Transaction Index: ${logger.COLORS.brightGreen}${txIndex}${logger.COLORS.reset}                                    ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
            console.log(`${logger.COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${logger.COLORS.reset}`);
            console.log('');
            console.log(`${logger.COLORS.brightYellow}Next steps:${logger.COLORS.reset}`);
            console.log(`  1. Other owners confirm: ${logger.COLORS.brightBlue}fsca wallet confirm ${txIndex}${logger.COLORS.reset}`);
            console.log(`  2. Execute when ready:   ${logger.COLORS.brightBlue}fsca wallet execute ${txIndex}${logger.COLORS.reset}`);
            console.log('');
        } else {
            console.log(`${logger.COLORS.brightGreen}✓ Transaction submitted!${logger.COLORS.reset}`);
        }

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to submit transaction:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};
