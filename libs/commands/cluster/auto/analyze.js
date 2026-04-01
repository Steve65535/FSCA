/**
 * 静态分析阶段：扫描 → 解析注解 → pod 级环检测 → 函数级环检测
 *
 * 被 auto.js 和 check.js 共同复用。
 * 不执行任何链上操作，不读取 project.json。
 *
 * 返回值中的 funcCycleEdgeSet：
 *   函数环涉及的合约对 Set<"fromId->toId">
 *   auto.js 在 link 阶段跳过这些边（既不 beforeMount 也不 afterMount）
 */

const scan = require('./scanner');
const parse = require('./parser');
const { buildGraph, detectCycles, topoSort } = require('./graph');
const { buildFunctionGraph, detectFunctionCycles } = require('./funcgraph');
const { logDiagnostic } = require('../../../../libs/logger');

/**
 * 将函数环路径转换为需要跳过的最小 pod 边集合
 *
 * 策略：每个函数环只移除一条边来打破它（取环路径的最后一条跨合约边）
 * 而不是把环中所有合约对的双向边都跳过。
 *
 * 函数环 ["A.foo", "B.bar", "C.baz", "A.foo"]
 *   → 跨合约边: A→B, B→C, C→A
 *   → 只跳过最后一条: C→A (对应 pod 边 C_id → A_id)
 */
function funcCyclesToEdgeSet(funcCycles, idToName) {
    const nameToId = new Map();
    for (const [id, name] of idToName) nameToId.set(name, id);

    const edgeSet = new Set();

    for (const cycle of funcCycles) {
        // Find the last cross-contract edge in the cycle path to remove
        // cycle = ["A.foo", "B.bar", "C.baz", "A.foo"] (last repeats first)
        for (let i = cycle.length - 2; i >= 0; i--) {
            const fromContract = cycle[i].split('.')[0];
            const toContract = cycle[i + 1].split('.')[0];
            if (fromContract === toContract) continue; // skip same-contract steps
            const fromId = nameToId.get(fromContract);
            const toId = nameToId.get(toContract);
            if (fromId !== undefined && toId !== undefined) {
                // Only skip this one edge (the minimum to break the cycle)
                edgeSet.add(`${fromId}->${toId}`);
                break;
            }
        }
    }

    return edgeSet;
}

module.exports = function analyze(rootDir) {
    const warnings = [];
    const errors = [];

    // 1. Scan
    const { contracts: scanned, warnings: scanWarnings } = scan(rootDir);
    for (const w of scanWarnings) {
        console.warn(`  ⚠  ${w}`);
        warnings.push(w);
    }

    // 2. Parse annotations + ID conflict detection
    const parsed = [];
    const idMap = new Map(); // arkheionId → contractName

    for (const { filePath, contractName, sourceCode } of scanned) {
        const result = parse(sourceCode, contractName);
        if (!result.autoEnabled) continue;

        if (result.error) {
            errors.push(result.error);
            logDiagnostic('Annotation error — contract skipped', [
                `Contract : ${contractName}`,
                `File     : ${filePath}`,
                `Problem  : ${result.error}`,
                `Fix      : Add "// @arkheion-id <number>" above the contract declaration`,
            ], 'warn');
            continue;
        }

        if (idMap.has(result.arkheionId)) {
            const conflictName = idMap.get(result.arkheionId);
            const conflictFile = parsed.find(p => p.contractName === conflictName)?.filePath || '(unknown)';
            logDiagnostic('ID conflict — aborted', [
                `Duplicate ID : @arkheion-id ${result.arkheionId}`,
                `Contract A   : ${conflictName}`,
                `File A       : ${conflictFile}`,
                `Contract B   : ${contractName}`,
                `File B       : ${filePath}`,
                `Fix          : Each contract must have a unique @arkheion-id value`,
            ], 'error');
            throw new Error(`ID conflict: @arkheion-id ${result.arkheionId} used by both "${conflictName}" and "${contractName}"`);
        }

        idMap.set(result.arkheionId, contractName);
        parsed.push({ ...result, filePath, sourceCode });
    }

    const idToName = new Map(parsed.map(c => [c.arkheionId, c.contractName]));
    const idToContract = new Map(parsed.map(c => [c.arkheionId, c]));

    // 3. Pod-level dependency graph + cycle detection + topo sort
    const graph = buildGraph(parsed);
    const { hasCycle, cycles: podCycles } = detectCycles(graph);

    if (hasCycle) {
        for (const cycle of podCycles) {
            const names = cycle.map(id => idToName.get(id) || `id=${id}`);
            logDiagnostic('Pod-level dependency cycle detected', [
                `Cycle    : ${names.join(' → ')}`,
                `Handling : Cycle edges will be deferred and linked via addActivePodAfterMount /`,
                `           addPassivePodAfterMount once all contracts are mounted.`,
                `Action   : No manual intervention needed — assembly will proceed automatically.`,
            ], 'warn');
        }
    }

    const { sorted, cycleEdges } = topoSort(graph, podCycles);

    // 4. Function-level call cycle detection
    const funcGraph = buildFunctionGraph(parsed);
    const funcCycles = detectFunctionCycles(funcGraph);
    const funcCycleEdgeSet = funcCyclesToEdgeSet(funcCycles, idToName);

    if (funcCycles.length > 0) {
        for (const cycle of funcCycles) {
            const contractsInCycle = [...new Set(cycle.map(n => n.split('.')[0]))];
            logDiagnostic('Function-level call cycle — minimum pod link skipped', [
                `Cycle     : ${cycle.join(' → ')}`,
                `Contracts : ${contractsInCycle.join(', ')}`,
                `Risk      : These functions call each other across contracts — potential infinite loop.`,
                `Action    : One pod link (the last cross-contract edge in this cycle) will NOT be`,
                `            assembled. All other pod links and contracts assemble normally.`,
                `Fix       : Add noReentryGuard modifier or a state-based termination condition.`,
            ], 'error');
        }
    }

    return {
        parsed,
        idToName,
        idToContract,
        sorted,
        cycleEdges,
        podCycles: hasCycle ? podCycles : [],
        funcCycles,
        funcCycleEdgeSet,
        warnings,
        errors,
    };
};
