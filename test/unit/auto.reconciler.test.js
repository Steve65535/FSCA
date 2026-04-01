/**
 * Unit tests for libs/commands/cluster/auto/reconciler.js
 */

const reconcile = require('../../libs/commands/cluster/auto/reconciler');

function makeContract(arkheionId, contractName, activePods = [], passivePods = []) {
    return { arkheionId, contractName, activePods, passivePods };
}

function makeConfig(running = [], unmounted = []) {
    return { arkheion: { runningcontracts: running, unmountedcontracts: unmounted } };
}

describe('reconciler', () => {
    describe('undeployed contracts', () => {
        it('assigns deploy+link+mount actions when contract not in project.json', () => {
            const contracts = [makeContract(1, 'AccountStorage')];
            const config = makeConfig();
            const { plan } = reconcile(contracts, config);
            expect(plan[0].actions).toEqual(['deploy', 'link', 'mount']);
            expect(plan[0].state).toBe('undeployed');
            expect(plan[0].existingAddress).toBeNull();
        });

        it('handles multiple undeployed contracts', () => {
            const contracts = [makeContract(1, 'A'), makeContract(2, 'B')];
            const { plan } = reconcile(contracts, makeConfig());
            expect(plan).toHaveLength(2);
            expect(plan.every(p => p.state === 'undeployed')).toBe(true);
        });
    });

    describe('unmounted contracts', () => {
        it('assigns link+mount actions when contract is in unmountedcontracts', () => {
            const contracts = [makeContract(1, 'AccountStorage')];
            const config = makeConfig([], [{ name: 'AccountStorage', address: '0xabc', contractId: null }]);
            const { plan } = reconcile(contracts, config);
            expect(plan[0].actions).toEqual(['link', 'mount']);
            expect(plan[0].state).toBe('unmounted');
            expect(plan[0].existingAddress).toBe('0xabc');
        });

        it('matches unmounted by name', () => {
            const contracts = [makeContract(2, 'TradeEngine')];
            const config = makeConfig([], [
                { name: 'OtherContract', address: '0x111' },
                { name: 'TradeEngine', address: '0x222' },
            ]);
            const { plan } = reconcile(contracts, config);
            expect(plan[0].existingAddress).toBe('0x222');
        });
    });

    describe('mounted contracts', () => {
        it('assigns no actions when contract is in runningcontracts by contractId', () => {
            const contracts = [makeContract(1, 'AccountStorage')];
            const config = makeConfig([{ name: 'AccountStorage', address: '0xdef', contractId: 1 }]);
            const { plan, warnings } = reconcile(contracts, config);
            expect(plan[0].actions).toEqual([]);
            expect(plan[0].state).toBe('mounted');
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toMatch(/already mounted/);
        });

        it('matches mounted by numeric contractId comparison', () => {
            const contracts = [makeContract(3, 'RiskGuard')];
            const config = makeConfig([{ name: 'RiskGuard', address: '0x999', contractId: '3' }]); // string id
            const { plan } = reconcile(contracts, config);
            expect(plan[0].state).toBe('mounted');
        });
    });

    describe('mixed states', () => {
        it('correctly categorizes a mix of mounted, unmounted, undeployed', () => {
            const contracts = [
                makeContract(1, 'AccountStorage'),
                makeContract(2, 'TradeEngine'),
                makeContract(3, 'RiskGuard'),
            ];
            const config = makeConfig(
                [{ name: 'AccountStorage', address: '0x1', contractId: 1 }],
                [{ name: 'TradeEngine', address: '0x2' }]
            );
            const { plan } = reconcile(contracts, config);
            const byId = Object.fromEntries(plan.map(p => [p.arkheionId, p]));
            expect(byId[1].state).toBe('mounted');
            expect(byId[2].state).toBe('unmounted');
            expect(byId[3].state).toBe('undeployed');
        });
    });

    describe('pod info passthrough', () => {
        it('preserves activePods and passivePods in plan items', () => {
            const contracts = [makeContract(2, 'TradeEngine', [1, 3], [])];
            const { plan } = reconcile(contracts, makeConfig());
            expect(plan[0].activePods).toEqual([1, 3]);
            expect(plan[0].passivePods).toEqual([]);
        });
    });

    describe('contractId null vs arkheion-id 0 boundary', () => {
        it('infra record with contractId=null does not match arkheionId=0', () => {
            // Simulate a runningcontracts that has an infra record (contractId: null)
            const running = [
                { name: 'MultiSigWallet', address: '0xMSIG', contractId: null },
                { name: 'ClusterManager', address: '0xCLUSTER', contractId: null },
            ];
            const contracts = [makeContract(0, 'ContractZero')];
            const { plan } = reconcile(contracts, makeConfig(running));
            // ContractZero (arkheionId=0) must NOT be treated as already mounted
            expect(plan[0].state).toBe('undeployed');
            expect(plan[0].actions).toEqual(['deploy', 'link', 'mount']);
        });

        it('real contractId=0 entry in runningcontracts is matched correctly', () => {
            const running = [
                { name: 'MultiSigWallet', address: '0xMSIG', contractId: null },
                { name: 'ContractZero', address: '0xZERO', contractId: 0 },
            ];
            const contracts = [makeContract(0, 'ContractZero')];
            const { plan, warnings } = reconcile(contracts, makeConfig(running));
            expect(plan[0].state).toBe('mounted');
            expect(warnings.length).toBe(1);
            expect(warnings[0]).toMatch(/already mounted/);
        });

        it('null contractId records in runningcontracts never block any arkheionId', () => {
            const running = [
                { name: 'ProxyWallet', address: '0xPW', contractId: null },
                { name: 'EvokerManager', address: '0xEM', contractId: null },
            ];
            const contracts = [makeContract(1, 'TradeEngine'), makeContract(2, 'OrderBook')];
            const { plan } = reconcile(contracts, makeConfig(running));
            expect(plan.every(p => p.state === 'undeployed')).toBe(true);
        });
    });
});
