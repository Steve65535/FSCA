/**
 * 合约名称/Artifact 冲突扫描器
 *
 * scanContractConflicts(rootDir, contractName):
 *   扫描 artifacts/contracts/undeployed/** 以及 artifacts/contracts/<Name>.sol/<Name>.json
 *   （与 loadArtifact 实际搜索路径完全对齐），fail-fast 防止歧义命中。
 *
 * scanAllConflicts(rootDir):
 *   全量扫描，返回所有冲突（供 auto/init 使用）。
 */

const fs = require('fs');
const path = require('path');

/**
 * 递归收集 dir 下所有 .json artifact 文件（排除 .dbg.json）
 * @param {string} dir
 * @param {string[]} results
 * @returns {string[]}
 */
function walkArtifacts(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkArtifacts(full, results);
        } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.dbg.json')) {
            results.push(full);
        }
    }
    return results;
}

/**
 * 递归收集 dir 下所有 .sol 源文件
 * @param {string} dir
 * @param {string[]} results
 * @returns {string[]}
 */
function walkSources(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkSources(full, results);
        } else if (entry.isFile() && entry.name.endsWith('.sol')) {
            results.push(full);
        }
    }
    return results;
}

/**
 * 扫描单个合约名的 artifact 冲突
 * 返回命中路径列表（长度 > 1 表示冲突）
 * @param {string} rootDir
 * @param {string} contractName
 * @returns {{ hits: string[], conflict: boolean }}
 */
function scanContractConflicts(rootDir, contractName) {
    // Mirror loadArtifact search paths exactly:
    // 1. artifacts/contracts/undeployed/**
    // 2. artifacts/contracts/<Name>.sol/<Name>.json (root fallback)
    const undeployedBase = path.join(rootDir, 'artifacts', 'contracts', 'undeployed');
    const allArtifacts = walkArtifacts(undeployedBase);

    // Add root fallback path if it exists
    const rootFallback = path.join(rootDir, 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`);
    if (fs.existsSync(rootFallback)) {
        allArtifacts.push(rootFallback);
    }

    const targetFile = `${contractName}.json`;
    const hits = allArtifacts.filter(p => path.basename(p) === targetFile);

    return {
        hits,
        conflict: hits.length > 1,
    };
}

/**
 * 全量扫描：收集 artifacts/contracts/undeployed 下所有同名 artifact 冲突
 * 以及 contracts/undeployed 下所有同名 .sol 源文件冲突
 * @param {string} rootDir
 * @returns {{ artifactConflicts: Object[], sourceConflicts: Object[] }}
 */
function scanAllConflicts(rootDir) {
    // --- Artifact conflicts ---
    // Mirror loadArtifact: scan undeployed/** plus root artifacts/contracts/<Name>.sol/<Name>.json
    const undeployedBase = path.join(rootDir, 'artifacts', 'contracts', 'undeployed');
    const rootArtifactsBase = path.join(rootDir, 'artifacts', 'contracts');
    const allArtifacts = walkArtifacts(undeployedBase);

    // Add root-level artifacts (direct children of artifacts/contracts/<Name>.sol/)
    // but exclude the undeployed subtree already collected
    if (fs.existsSync(rootArtifactsBase)) {
        for (const entry of fs.readdirSync(rootArtifactsBase, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === 'undeployed') continue;
            const subdir = path.join(rootArtifactsBase, entry.name);
            for (const f of fs.readdirSync(subdir, { withFileTypes: true })) {
                if (f.isFile() && f.name.endsWith('.json') && !f.name.endsWith('.dbg.json')) {
                    allArtifacts.push(path.join(subdir, f.name));
                }
            }
        }
    }

    const artifactsByName = new Map();
    for (const p of allArtifacts) {
        const name = path.basename(p, '.json');
        if (!artifactsByName.has(name)) artifactsByName.set(name, []);
        artifactsByName.get(name).push(p);
    }

    const artifactConflicts = [];
    for (const [name, paths] of artifactsByName) {
        if (paths.length > 1) {
            artifactConflicts.push({ contractName: name, paths });
        }
    }

    // --- Source conflicts ---
    const sourcesBase = path.join(rootDir, 'contracts', 'undeployed');
    const allSources = walkSources(sourcesBase);

    const sourcesByName = new Map();
    for (const p of allSources) {
        const name = path.basename(p, '.sol').toLowerCase();
        if (!sourcesByName.has(name)) sourcesByName.set(name, []);
        sourcesByName.get(name).push(p);
    }

    const sourceConflicts = [];
    for (const [name, paths] of sourcesByName) {
        if (paths.length > 1) {
            sourceConflicts.push({ contractName: name, paths });
        }
    }

    return { artifactConflicts, sourceConflicts };
}

/**
 * 扫描 contracts/undeployed 下所有 .sol 文件的 @arkheion-id 注解冲突
 * 同一 contractId 被不同合约名复用 → 冲突
 * @param {string} rootDir
 * @returns {{ idConflicts: Object[] }}
 *   idConflicts: [{ contractId, entries: [{ contractName, filePath }] }]
 */
function scanIdConflicts(rootDir) {
    const sourcesBase = path.join(rootDir, 'contracts', 'undeployed');
    const allSources = walkSources(sourcesBase);

    // contractId (number) → [{ contractName, filePath }]
    const byId = new Map();

    for (const filePath of allSources) {
        const source = fs.readFileSync(filePath, 'utf-8');

        // Extract @arkheion-id annotation
        const idMatch = source.match(/@arkheion-id\s+(\d+)/);
        if (!idMatch) continue;
        const contractId = parseInt(idMatch[1], 10);

        // Extract contract name
        const nameMatch = source.match(/contract\s+(\w+)\s+is\s+/);
        const contractName = nameMatch ? nameMatch[1] : path.basename(filePath, '.sol');

        if (!byId.has(contractId)) byId.set(contractId, []);
        byId.get(contractId).push({ contractName, filePath });
    }

    const idConflicts = [];
    for (const [contractId, entries] of byId) {
        if (entries.length > 1) {
            idConflicts.push({ contractId, entries });
        }
    }

    return { idConflicts };
}

/**
 * 打印冲突矩阵并抛出错误（fail-fast）
 * @param {string} contractName
 * @param {string[]} hits
 */
function failOnConflict(contractName, hits) {
    console.error(`✗ Artifact conflict detected for "${contractName}":`);
    console.error(`  Found ${hits.length} matching artifacts:`);
    for (const h of hits) {
        console.error(`    - ${h}`);
    }
    console.error(`  Resolution:`);
    console.error(`    - If duplicate exists in contracts/undeployed/ subdirectories, remove the extra .sol file.`);
    console.error(`    - If a stale artifact exists in artifacts/contracts/${contractName}.sol/, delete that directory.`);
    throw new Error(`Artifact conflict: "${contractName}" found in ${hits.length} locations. Resolve before deploying.`);
}

/**
 * 打印全量冲突报告并抛出错误（fail-fast）
 * @param {{ artifactConflicts: Object[], sourceConflicts: Object[], idConflicts?: Object[] }} conflicts
 */
function failOnAllConflicts(conflicts) {
    const { artifactConflicts, sourceConflicts, idConflicts = [] } = conflicts;
    if (artifactConflicts.length === 0 && sourceConflicts.length === 0 && idConflicts.length === 0) return;

    console.error(`✗ Contract conflicts detected — resolve before proceeding:`);
    console.error('');

    if (artifactConflicts.length > 0) {
        console.error(`  Artifact conflicts (${artifactConflicts.length}):`);
        for (const { contractName, paths } of artifactConflicts) {
            console.error(`    "${contractName}":`);
            for (const p of paths) console.error(`      - ${p}`);
        }
        console.error('');
    }

    if (sourceConflicts.length > 0) {
        console.error(`  Source conflicts (${sourceConflicts.length}):`);
        for (const { contractName, paths } of sourceConflicts) {
            console.error(`    "${contractName}":`);
            for (const p of paths) console.error(`      - ${p}`);
        }
        console.error('');
    }

    if (idConflicts.length > 0) {
        console.error(`  Contract ID conflicts (${idConflicts.length}):`);
        for (const { contractId, entries } of idConflicts) {
            console.error(`    @arkheion-id ${contractId} used by multiple contracts:`);
            for (const { contractName, filePath } of entries) console.error(`      - ${contractName} (${filePath})`);
        }
        console.error('');
    }

    const total = artifactConflicts.length + sourceConflicts.length + idConflicts.length;
    const hints = [];
    if (artifactConflicts.length > 0 || sourceConflicts.length > 0) {
        hints.push('remove duplicate .sol files from contracts/undeployed/ subdirectories');
    }
    if (idConflicts.length > 0) {
        hints.push('ensure each @arkheion-id is used by only one contract');
    }
    throw new Error(`${total} contract conflict(s) detected. ${hints.join('; ')}.`);
}

module.exports = { scanContractConflicts, scanAllConflicts, scanIdConflicts, failOnConflict, failOnAllConflicts };
