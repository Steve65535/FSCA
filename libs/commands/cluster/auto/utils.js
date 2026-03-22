/**
 * 共享工具函数，供 auto 子模块复用
 * 避免在 auto.js / upgrade.js / mount.js 中重复定义相同逻辑
 */

const fs = require('fs');
const path = require('path');
const credentials = require('../../../../wallet/credentials');

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) throw new Error('project.json not found. Run "fsca init" first.');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const rpcUrl = credentials.resolveRpcUrl(config, rootDir);
    const privateKey = credentials.resolvePrivateKey(config, rootDir);
    if (!rpcUrl) throw new Error('RPC URL not configured');
    if (!privateKey) throw new Error('Private key not configured');
    config.network = config.network || {};
    config.account = config.account || {};
    config.network.rpc = rpcUrl;
    config.account.privateKey = privateKey;
    if (!config.fsca?.clusterAddress) throw new Error('fsca.clusterAddress not configured. Run "fsca cluster init" first.');
    return config;
}

function saveProjectConfig(rootDir, config) {
    fs.writeFileSync(path.join(rootDir, 'project.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function findArtifactRecursive(dir, contractName) {
    const target = `${contractName}.json`;
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const found = findArtifactRecursive(path.join(dir, entry.name), contractName);
            if (found) return found;
        } else if (entry.name === target && !entry.name.endsWith('.dbg.json')) {
            return path.join(dir, entry.name);
        }
    }
    return null;
}

function loadArtifact(rootDir, contractName) {
    const searchPaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'structure', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'wallet', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`),
    ];
    for (const p of searchPaths) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    // Recursive fallback: search entire artifacts directory
    const artifactsDir = path.join(rootDir, 'artifacts');
    const found = findArtifactRecursive(artifactsDir, contractName);
    if (found) return JSON.parse(fs.readFileSync(found, 'utf-8'));
    throw new Error(`Artifact not found for "${contractName}". Run "npx hardhat compile" first.`);
}

module.exports = { loadProjectConfig, saveProjectConfig, loadArtifact };
