/**
 * 提议治理变更 (添加/移除所有者, 修改阈值)
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

module.exports = async function propose({ rootDir, args = {}, subcommand }) {
    try {
        // Determine action based on subcommand
        let action, param, description;

        if (subcommand === 'add-owner') {
            action = 'proposeAddOwner';
            param = args.address;
            description = `Add owner: ${param}`;

            if (!ethers.isAddress(param)) {
                throw new Error(`Invalid address: ${param}`);
            }
        } else if (subcommand === 'remove-owner') {
            action = 'proposeRemoveOwner';
            param = args.address;
            description = `Remove owner: ${param}`;

            if (!ethers.isAddress(param)) {
                throw new Error(`Invalid address: ${param}`);
            }
        } else if (subcommand === 'change-threshold') {
            action = 'proposeChangeThreshold';
            param = args.threshold;
            description = `Change threshold to: ${param}`;

            if (!param || param < 1) {
                throw new Error('Invalid threshold');
            }
        } else {
            throw new Error(`Unknown subcommand: ${subcommand}`);
        }

        console.log(`${logger.COLORS.brightBlue}Proposing governance change: ${description}${logger.COLORS.reset}`);
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

        // 3. Submit proposal
        let tx;
        if (action === 'proposeAddOwner') {
            tx = await multiSigWallet.proposeAddOwner(param, 0, '0x');
        } else if (action === 'proposeRemoveOwner') {
            tx = await multiSigWallet.proposeRemoveOwner(param, 0, '0x');
        } else if (action === 'proposeChangeThreshold') {
            tx = await multiSigWallet.proposeChangeThreshold(param, 0, '0x');
        }

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
            console.log(`${logger.COLORS.brightGreen}✓ Governance proposal submitted!${logger.COLORS.reset}`);
            console.log('');
            console.log(`${logger.COLORS.brightPurple}╔═══════════════════════════════════════════════════════════════╗${logger.COLORS.reset}`);
            console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.bold}Proposal Index: ${logger.COLORS.brightGreen}${txIndex}${logger.COLORS.reset}                                       ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
            console.log(`${logger.COLORS.brightPurple}║${logger.COLORS.reset}  ${logger.COLORS.brightYellow}Action:${logger.COLORS.reset} ${description.padEnd(50)} ${logger.COLORS.brightPurple}║${logger.COLORS.reset}`);
            console.log(`${logger.COLORS.brightPurple}╚═══════════════════════════════════════════════════════════════╝${logger.COLORS.reset}`);
            console.log('');
            console.log(`${logger.COLORS.brightYellow}Next steps:${logger.COLORS.reset}`);
            console.log(`  1. Other owners confirm: ${logger.COLORS.brightBlue}fsca wallet confirm ${txIndex}${logger.COLORS.reset}`);
            console.log(`  2. Execute when ready:   ${logger.COLORS.brightBlue}fsca wallet execute ${txIndex}${logger.COLORS.reset}`);
            console.log('');
        } else {
            console.log(`${logger.COLORS.brightGreen}✓ Proposal submitted!${logger.COLORS.reset}`);
        }

    } catch (error) {
        console.error(`${logger.COLORS.brightYellow}✗ Failed to submit proposal:${logger.COLORS.reset}`, error.message);
        process.exit(1);
    }
};
