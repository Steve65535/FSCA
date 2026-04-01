/**
 * NormalTemplate 信息查询
 * arkheion normal get modules <type> (active/passive)
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');

const getProvider = chainProvider.getProvider;

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function loadNormalTemplateABI(rootDir) {
    const possiblePaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'arkheion-core', 'lib', 'normaltemplate.sol', 'normalTemplate.json')
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')).abi;
    }
    throw new Error('NormalTemplate ABI not found.');
}

module.exports = async function get({ rootDir, args = {}, subcommands = [], commandName = '' }) {
    try {
        let item = subcommands[0]; // e.g. 'modules'

        if (commandName) {
            const parts = commandName.split(' ');
            const lastPart = parts[parts.length - 1];
            // command is like "normal get modules"
            if (lastPart === 'modules') {
                item = lastPart;
            }
        }

        if (item === 'modules') {
            const type = args.type || args.arg0;
            if (type !== 'active' && type !== 'passive') {
                throw new Error('Invalid type. Use "active" or "passive".');
            }

            // Load Config
            const config = loadProjectConfig(rootDir);
            const currentOperating = config.arkheion?.currentOperating;

            if (!currentOperating || !ethers.isAddress(currentOperating)) {
                throw new Error("No valid current operating contract. Run 'arkheion cluster choose <addr>' first.");
            }

            // Connect
            const provider = getProvider(config.network.rpc);
            const abi = loadNormalTemplateABI(rootDir);
            const contract = new ethers.Contract(currentOperating, abi, provider);

            console.log(`Querying ${type} modules from ${currentOperating}...`);

            // Fetch Data
            // returns (AddressPod.Module[] memory)
            // Module struct: { uint32 contractId; address moduleAddress; }
            let modules;
            if (type === 'active') {
                modules = await contract.getAllActiveModules();
            } else {
                modules = await contract.getAllPassiveModules();
            }

            // Display
            if (modules.length === 0) {
                console.log(`No ${type} modules found.`);
            } else {
                console.log(`${modules.length} ${type} module(s) found:`);
                modules.forEach((mod, index) => {
                    // Result from ethers might be an array-like object or Proxy, access properties safely
                    const id = mod[0] || mod.contractId;
                    const addr = mod[1] || mod.moduleAddress;
                    console.log(`  [${index + 1}] ID: ${id} | Address: ${addr}`);
                });
            }

        } else {
            console.log('Available getters: modules');
        }

    } catch (error) {
        console.error('Failed to get info:', error.message);
        process.exit(1);
    }
};
