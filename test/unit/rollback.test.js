/**
 * Unit tests for libs/commands/cluster/rollback.js (logic only, no chain calls)
 * Tests version.js helpers as used by rollback scenarios.
 */

const {
    normalizeRecord,
    findMounted,
    findGeneration,
    findPreviousGeneration,
} = require('../../libs/commands/version');

// ─── Rollback target resolution ───────────────────────────────────────────────

describe('rollback target resolution', () => {
    const allDeployed = [
        { contractId: 1, generation: 1, status: 'deprecated', address: '0xAAA', name: 'TradeEngine', podSnapshot: { active: [{ contractId: 2 }], passive: [] } },
        { contractId: 1, generation: 2, status: 'deprecated', address: '0xBBB', name: 'TradeEngine', podSnapshot: { active: [{ contractId: 2 }], passive: [] } },
        { contractId: 1, generation: 3, status: 'mounted',    address: '0xCCC', name: 'TradeEngine', podSnapshot: { active: [], passive: [] } },
    ];

    it('findPreviousGeneration returns gen 2 when gen 3 is mounted', () => {
        const prev = findPreviousGeneration(allDeployed, 1);
        expect(prev.generation).toBe(2);
        expect(prev.address).toBe('0xBBB');
    });

    it('findGeneration returns correct record by generation number', () => {
        expect(findGeneration(allDeployed, 1, 1).address).toBe('0xAAA');
        expect(findGeneration(allDeployed, 1, 2).address).toBe('0xBBB');
    });

    it('findMounted returns the currently mounted record', () => {
        expect(findMounted(allDeployed, 1).address).toBe('0xCCC');
    });

    it('returns null for findPreviousGeneration when only one generation exists', () => {
        const single = [{ contractId: 1, generation: 1, status: 'mounted', address: '0xAAA' }];
        expect(findPreviousGeneration(single, 1)).toBeNull();
    });

    it('returns null for findMounted when nothing is mounted', () => {
        const none = [{ contractId: 1, generation: 1, status: 'deprecated', address: '0xAAA' }];
        expect(findMounted(none, 1)).toBeNull();
    });
});

// ─── Status validation ────────────────────────────────────────────────────────

describe('rollback status validation', () => {
    it('normalizeRecord marks missing status as deployed', () => {
        const r = normalizeRecord({ contractId: 1, address: '0xAAA' }, 'alldeployedcontracts');
        expect(r.status).toBe('deployed');
    });

    it('normalizeRecord preserves deprecated status', () => {
        const r = normalizeRecord({ contractId: 1, status: 'deprecated' }, 'alldeployedcontracts');
        expect(r.status).toBe('deprecated');
    });

    it('normalizeRecord preserves archived status', () => {
        const r = normalizeRecord({ contractId: 1, status: 'archived' }, 'alldeployedcontracts');
        expect(r.status).toBe('archived');
    });

    it('only deprecated records should be rollback targets', () => {
        const records = [
            { status: 'deprecated' },
            { status: 'mounted' },
            { status: 'deployed' },
            { status: 'archived' },
        ];
        const valid = records.filter(r => normalizeRecord(r, 'alldeployedcontracts').status === 'deprecated');
        expect(valid).toHaveLength(1);
    });
});

// ─── podSnapshot (contractId-only) ───────────────────────────────────────────

describe('podSnapshot structure', () => {
    it('normalizeRecord fills empty podSnapshot when missing', () => {
        const r = normalizeRecord({ contractId: 1 }, 'alldeployedcontracts');
        expect(r.podSnapshot).toEqual({ active: [], passive: [] });
    });

    it('preserves contractId-only podSnapshot', () => {
        const snap = { active: [{ contractId: 2 }, { contractId: 5 }], passive: [{ contractId: 3 }] };
        const r = normalizeRecord({ contractId: 1, podSnapshot: snap }, 'alldeployedcontracts');
        expect(r.podSnapshot.active).toHaveLength(2);
        expect(r.podSnapshot.active[0]).toEqual({ contractId: 2 });
        expect(r.podSnapshot.passive[0]).toEqual({ contractId: 3 });
    });

    it('podSnapshot does not contain addresses', () => {
        const snap = { active: [{ contractId: 2 }], passive: [] };
        const r = normalizeRecord({ podSnapshot: snap }, 'alldeployedcontracts');
        for (const entry of r.podSnapshot.active) {
            expect(entry.moduleAddress).toBeUndefined();
        }
    });
});

// ─── project.json state transitions ──────────────────────────────────────────

describe('project.json state transitions after rollback', () => {
    it('marks current as deprecated and target as mounted', () => {
        const currentAddr = '0xCCC';
        const targetAddr = '0xBBB';
        const currentActivePods = [{ contractId: 2 }];
        const currentPassivePods = [];

        let allDeployed = [
            { contractId: 1, generation: 2, status: 'deprecated', address: targetAddr },
            { contractId: 1, generation: 3, status: 'mounted',    address: currentAddr },
        ];

        // Simulate the project.json update logic from rollback.js
        allDeployed = allDeployed.map(r => {
            if (r.address.toLowerCase() === currentAddr.toLowerCase()) {
                return { ...r, status: 'deprecated', podSnapshot: { active: currentActivePods, passive: currentPassivePods } };
            }
            if (r.address.toLowerCase() === targetAddr.toLowerCase()) {
                return { ...r, status: 'mounted' };
            }
            return r;
        });

        const current = allDeployed.find(r => r.address === currentAddr);
        const target = allDeployed.find(r => r.address === targetAddr);

        expect(current.status).toBe('deprecated');
        expect(current.podSnapshot.active).toEqual(currentActivePods);
        expect(target.status).toBe('mounted');
    });
});
