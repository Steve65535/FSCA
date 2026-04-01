/**
 * arkheion cluster check
 * 静态检查：扫描注解 → ID 冲突检测 → pod 级环检测 → 函数级环检测
 * 不执行任何链上操作，不部署，不挂载。
 */

const analyze = require('./auto/analyze');
const { scanAllConflicts, scanIdConflicts, failOnAllConflicts } = require('../contractConflicts');

module.exports = async function check({ rootDir }) {
    console.log('Running auto check (static analysis only)...\n');

    // Pre-flight: source/artifact/ID conflict check (mirrors auto/init gates)
    try {
        const conflicts = scanAllConflicts(rootDir);
        const { idConflicts } = scanIdConflicts(rootDir);
        failOnAllConflicts({ ...conflicts, idConflicts });
    } catch (error) {
        console.error(`\n✗ Conflict check failed: ${error.message}`);
        process.exit(1);
    }

    let result;
    try {
        result = analyze(rootDir);
    } catch (error) {
        // Fatal: ID conflict
        console.error(`\n✗ Check failed: ${error.message}`);
        process.exit(1);
    }

    const { parsed, idToName, sorted, cycleEdges, podCycles, funcCycles, funcCycleEdgeSet, warnings, errors } = result;

    // Annotation errors exist even if parsed.length === 0
    if (parsed.length === 0 && errors.length === 0 && warnings.length === 0) {
        console.log('No contracts with @arkheion-auto yes found. Nothing to check.');
        return;
    }

    // Summary table
    console.log(`Contracts found    : ${parsed.length}`);
    if (parsed.length > 0) {
        console.log(`Topo order         : ${sorted.map(id => `${idToName.get(id)}(${id})`).join(' → ')}`);
    }
    console.log(`Pod cycles         : ${podCycles.length} (handled automatically via afterMount)`);
    console.log(`Pod cycle edges    : ${cycleEdges.length}`);
    console.log(`Function cycles    : ${funcCycles.length}${funcCycles.length > 0 ? ' ✗ — affected pod links will be skipped' : ''}`);
    console.log(`Skipped pod links  : ${funcCycleEdgeSet.size} (due to function cycles)`);
    console.log(`Annotation errors  : ${errors.length}`);
    console.log(`Warnings           : ${warnings.length}`);

    const hasFatal = funcCycles.length > 0 || errors.length > 0;
    const hasWarnings = podCycles.length > 0 || warnings.length > 0;

    if (!hasFatal && !hasWarnings) {
        console.log('\n✓ All checks passed. Safe to run "arkheion cluster auto".');
    } else if (hasFatal) {
        console.log('\n✗ Check completed with errors. Some pod links will be skipped during assembly.');
        console.log('  Review the diagnostics above, then run "arkheion cluster auto" to proceed.');
        process.exit(1);
    } else {
        console.log('\n⚠  Check completed with warnings. Assembly will handle pod cycles automatically.');
        console.log('  Run "arkheion cluster auto" to proceed.');
    }
};
