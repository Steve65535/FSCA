/**
 * 状态协调器：对比 project.json 确定每个合约需要执行的操作
 */

module.exports = function reconcile(contracts, projectConfig) {
    const arkheion = projectConfig.arkheion || {};
    const running = arkheion.runningcontracts || [];
    const unmounted = arkheion.unmountedcontracts || [];

    const results = [];
    const warnings = [];

    for (const c of contracts) {
        const { contractName, arkheionId, activePods, passivePods } = c;

        // Check if already mounted (match by contractId, guard against null)
        const mountedEntry = running.find(r => r.contractId != null && Number(r.contractId) === arkheionId);
        if (mountedEntry) {
            warnings.push(`Contract "${contractName}" (id=${arkheionId}) is already mounted at ${mountedEntry.address}, skipping.`);
            results.push({
                contractName, arkheionId, activePods, passivePods,
                state: 'mounted',
                existingAddress: mountedEntry.address,
                actions: [],
            });
            continue;
        }

        // Check if deployed but unmounted (match by name)
        const unmountedEntry = unmounted.find(u => u.name === contractName);
        if (unmountedEntry) {
            results.push({
                contractName, arkheionId, activePods, passivePods,
                state: 'unmounted',
                existingAddress: unmountedEntry.address,
                actions: ['link', 'mount'],
            });
            continue;
        }

        // Not deployed yet
        results.push({
            contractName, arkheionId, activePods, passivePods,
            state: 'undeployed',
            existingAddress: null,
            actions: ['deploy', 'link', 'mount'],
        });
    }

    return { plan: results, warnings };
};
