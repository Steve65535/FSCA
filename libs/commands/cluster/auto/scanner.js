/**
 * 扫描 contracts/ 目录下的 .sol 文件
 * 返回继承自 normalTemplate 且包含 @arkheion-auto 注解的合约列表
 */

const fs = require('fs');
const path = require('path');

const CORE_FILES = new Set([
    'normaltemplate.sol',
    'addresspod.sol',
    'noreentryguard.sol',
    'clustermanager.sol',
    'evokermanager.sol',
    'multisigwallet.sol',
    'proxywallet.sol',
]);

function walkDir(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(full, results);
        } else if (entry.isFile() && entry.name.endsWith('.sol')) {
            if (!CORE_FILES.has(entry.name.toLowerCase())) {
                results.push(full);
            }
        }
    }
    return results;
}

function extractContractName(source) {
    // Match: contract <Name> is ... normalTemplate ...
    const match = source.match(/contract\s+(\w+)\s+is\s+[^{]*\bnormalTemplate\b/);
    return match ? match[1] : null;
}

module.exports = function scan(rootDir) {
    const dirs = [
        path.join(rootDir, 'contracts', 'undeployed'),
        path.join(rootDir, 'contracts', 'deployed'),
    ];

    const results = [];
    const seenNames = new Map(); // contractName -> filePath (for dedup)
    const warnings = [];

    for (const dir of dirs) {
        const isUndeployed = dir.includes('undeployed');
        for (const filePath of walkDir(dir)) {
            const sourceCode = fs.readFileSync(filePath, 'utf-8');
            const contractName = extractContractName(sourceCode);
            if (!contractName) continue;

            if (seenNames.has(contractName)) {
                if (isUndeployed) {
                    // undeployed takes priority — replace deployed entry
                    const idx = results.findIndex(r => r.contractName === contractName);
                    if (idx >= 0) {
                        warnings.push(`Duplicate contract "${contractName}": using undeployed version, skipping ${results[idx].filePath}`);
                        results[idx] = { filePath, contractName, sourceCode };
                    }
                } else {
                    warnings.push(`Duplicate contract "${contractName}" in deployed/, skipping ${filePath}`);
                }
                continue;
            }

            seenNames.set(contractName, filePath);
            results.push({ filePath, contractName, sourceCode });
        }
    }

    return { contracts: results, warnings };
};
