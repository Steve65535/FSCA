/**
 * Unit tests for libs/commands/version.js
 */

const {
    nextGeneration,
    nextDeploySeq,
    normalizeRecord,
    findMounted,
    findGeneration,
    findPreviousGeneration,
} = require('../../libs/commands/version');

// ─── nextGeneration ───────────────────────────────────────────────────────────

describe('nextGeneration', () => {
    it('returns 1 when no records exist for contractId', () => {
        expect(nextGeneration([], 1)).toBe(1);
    });

    it('returns max+1 when records exist', () => {
        const all = [
            { contractId: 1, generation: 1 },
            { contractId: 1, generation: 2 },
        ];
        expect(nextGeneration(all, 1)).toBe(3);
    });

    it('ignores records for other contractIds', () => {
        const all = [
            { contractId: 2, generation: 5 },
        ];
        expect(nextGeneration(all, 1)).toBe(1);
    });

    it('returns null when contractId is null', () => {
        expect(nextGeneration([], null)).toBeNull();
    });

    it('returns null when contractId is undefined', () => {
        expect(nextGeneration([], undefined)).toBeNull();
    });

    it('handles null generation entries gracefully', () => {
        const all = [
            { contractId: 1, generation: null },
            { contractId: 1, generation: 3 },
        ];
        expect(nextGeneration(all, 1)).toBe(4);
    });
});

// ─── nextDeploySeq ────────────────────────────────────────────────────────────

describe('nextDeploySeq', () => {
    it('returns 1 when no records have deploySeq', () => {
        expect(nextDeploySeq([])).toBe(1);
        expect(nextDeploySeq([{ name: 'Foo' }])).toBe(1);
    });

    it('returns max+1', () => {
        const all = [
            { deploySeq: 3 },
            { deploySeq: 1 },
            { deploySeq: 5 },
        ];
        expect(nextDeploySeq(all)).toBe(6);
    });
});

// ─── normalizeRecord ──────────────────────────────────────────────────────────

describe('normalizeRecord', () => {
    it('sets status=mounted for runningcontracts source', () => {
        const r = normalizeRecord({ name: 'Foo', address: '0x1' }, 'runningcontracts');
        expect(r.status).toBe('mounted');
    });

    it('sets status=deployed for unmountedcontracts source', () => {
        const r = normalizeRecord({ name: 'Foo', address: '0x1' }, 'unmountedcontracts');
        expect(r.status).toBe('deployed');
    });

    it('sets status=deployed for alldeployedcontracts source', () => {
        const r = normalizeRecord({ name: 'Foo', address: '0x1' }, 'alldeployedcontracts');
        expect(r.status).toBe('deployed');
    });

    it('preserves existing status', () => {
        const r = normalizeRecord({ status: 'deprecated' }, 'runningcontracts');
        expect(r.status).toBe('deprecated');
    });

    it('sets generation=null when missing', () => {
        const r = normalizeRecord({}, 'alldeployedcontracts');
        expect(r.generation).toBeNull();
    });

    it('preserves existing generation', () => {
        const r = normalizeRecord({ generation: 3 }, 'alldeployedcontracts');
        expect(r.generation).toBe(3);
    });

    it('sets empty podSnapshot when missing', () => {
        const r = normalizeRecord({}, 'alldeployedcontracts');
        expect(r.podSnapshot).toEqual({ active: [], passive: [] });
    });

    it('preserves existing podSnapshot', () => {
        const snap = { active: [{ contractId: 2 }], passive: [] };
        const r = normalizeRecord({ podSnapshot: snap }, 'alldeployedcontracts');
        expect(r.podSnapshot).toEqual(snap);
    });

    it('does not mutate the original record', () => {
        const original = { name: 'Foo' };
        normalizeRecord(original, 'runningcontracts');
        expect(original.status).toBeUndefined();
    });
});

// ─── findMounted ──────────────────────────────────────────────────────────────

describe('findMounted', () => {
    it('finds the mounted record for a contractId', () => {
        const all = [
            { contractId: 1, generation: 1, status: 'deprecated' },
            { contractId: 1, generation: 2, status: 'mounted' },
        ];
        expect(findMounted(all, 1).generation).toBe(2);
    });

    it('returns null when no mounted record exists', () => {
        const all = [{ contractId: 1, status: 'deprecated' }];
        expect(findMounted(all, 1)).toBeNull();
    });

    it('returns null for empty array', () => {
        expect(findMounted([], 1)).toBeNull();
    });
});

// ─── findGeneration ───────────────────────────────────────────────────────────

describe('findGeneration', () => {
    it('finds a specific generation', () => {
        const all = [
            { contractId: 1, generation: 1, address: '0xAAA' },
            { contractId: 1, generation: 2, address: '0xBBB' },
        ];
        expect(findGeneration(all, 1, 1).address).toBe('0xAAA');
        expect(findGeneration(all, 1, 2).address).toBe('0xBBB');
    });

    it('returns null when generation not found', () => {
        expect(findGeneration([], 1, 1)).toBeNull();
    });
});

// ─── findMounted with legacy records ─────────────────────────────────────────

describe('findMounted with legacy records (no status field)', () => {
    it('finds mounted record from runningcontracts-style legacy record (no status)', () => {
        const all = [
            { contractId: 1, generation: 1, address: '0xAAA' }, // no status — legacy
        ];
        const result = findMounted(all, 1);
        expect(result).not.toBeNull();
        expect(result.address).toBe('0xAAA');
    });

    it('does not find deprecated record as mounted', () => {
        const all = [
            { contractId: 1, generation: 1, status: 'deprecated', address: '0xAAA' },
        ];
        expect(findMounted(all, 1)).toBeNull();
    });

    it('multiple legacy records (no status): returns the one with latest timeStamp', () => {
        const all = [
            { contractId: 1, address: '0xOLD', timeStamp: 1000 }, // no status
            { contractId: 1, address: '0xNEW', timeStamp: 2000 }, // no status
        ];
        const result = findMounted(all, 1);
        expect(result.address).toBe('0xNEW');
    });

    it('mixed legacy + explicit: prefers explicit mounted over legacy', () => {
        const all = [
            { contractId: 1, address: '0xLEGACY', timeStamp: 3000 },          // no status, newer
            { contractId: 1, address: '0xEXPLICIT', status: 'mounted', timeStamp: 1000 }, // explicit
        ];
        const result = findMounted(all, 1);
        expect(result.address).toBe('0xEXPLICIT');
    });
});

// ─── mount generation idempotency ────────────────────────────────────────────

describe('mount generation idempotency', () => {
    it('nextGeneration returns same value when address already has a generation', () => {
        const allDeployed = [
            { contractId: 1, generation: 2, status: 'mounted', address: '0xAAA' },
        ];
        // Simulate the fix: if record already has generation, reuse it
        const record = allDeployed.find(c => c.address.toLowerCase() === '0xaaa');
        const alreadyHasGeneration = record && record.generation != null;
        const gen = alreadyHasGeneration ? record.generation : nextGeneration(allDeployed, 1);
        expect(gen).toBe(2); // reused, not incremented to 3
    });

    it('nextGeneration increments when address has no generation yet', () => {
        const allDeployed = [
            { contractId: 1, generation: 2, status: 'deprecated', address: '0xOLD' },
        ];
        const record = allDeployed.find(c => c.address.toLowerCase() === '0xnew');
        const alreadyHasGeneration = record && record.generation != null;
        const gen = alreadyHasGeneration ? record.generation : nextGeneration(allDeployed, 1);
        expect(gen).toBe(3); // new generation
    });
});

// ─── rollback unmountedcontracts cleanup ─────────────────────────────────────

describe('rollback unmountedcontracts cleanup', () => {
    it('target address is removed from unmountedcontracts after rollback', () => {
        const targetAddr = '0xBBB';
        let unmounted = [
            { address: '0xAAA', name: 'Other' },
            { address: targetAddr, name: 'TradeEngine' },
        ];
        // Simulate rollback cleanup logic
        unmounted = unmounted.filter(
            c => c.address && c.address.toLowerCase() !== targetAddr.toLowerCase()
        );
        expect(unmounted).toHaveLength(1);
        expect(unmounted[0].address).toBe('0xAAA');
    });

    it('unmountedcontracts cleanup is idempotent when address not present', () => {
        const targetAddr = '0xBBB';
        let unmounted = [{ address: '0xAAA', name: 'Other' }];
        unmounted = unmounted.filter(
            c => c.address && c.address.toLowerCase() !== targetAddr.toLowerCase()
        );
        expect(unmounted).toHaveLength(1);
    });
});

describe('findPreviousGeneration', () => {
    it('returns generation N-1 when current is mounted at N', () => {
        const all = [
            { contractId: 1, generation: 1, status: 'deprecated', address: '0xOLD' },
            { contractId: 1, generation: 2, status: 'mounted', address: '0xNEW' },
        ];
        expect(findPreviousGeneration(all, 1).address).toBe('0xOLD');
    });

    it('returns null when mounted generation is 1 (no previous)', () => {
        const all = [{ contractId: 1, generation: 1, status: 'mounted' }];
        expect(findPreviousGeneration(all, 1)).toBeNull();
    });

    it('returns null when no mounted record', () => {
        const all = [{ contractId: 1, generation: 1, status: 'deprecated' }];
        expect(findPreviousGeneration(all, 1)).toBeNull();
    });

    it('legacy fallback: finds most recent deprecated record by timeStamp when no generation', () => {
        // Legacy records: no generation field, mounted record has no generation
        const all = [
            { contractId: 1, generation: null, status: 'deprecated', address: '0xOLD1', timeStamp: 1000 },
            { contractId: 1, generation: null, status: 'deprecated', address: '0xOLD2', timeStamp: 2000 },
            { contractId: 1, generation: null, status: 'mounted', address: '0xCURR', timeStamp: 3000 },
        ];
        const prev = findPreviousGeneration(all, 1);
        expect(prev).not.toBeNull();
        expect(prev.address).toBe('0xOLD2'); // most recent deprecated
    });

    it('legacy fallback: returns null when no deprecated records exist', () => {
        const all = [
            { contractId: 1, generation: null, status: 'mounted', address: '0xCURR', timeStamp: 3000 },
        ];
        expect(findPreviousGeneration(all, 1)).toBeNull();
    });

    it('legacy fallback: works when mounted record has no status (normalizes to mounted)', () => {
        // Truly legacy: no status, no generation — mounted record inferred from runningcontracts
        const all = [
            { contractId: 1, address: '0xOLD', timeStamp: 1000, status: 'deprecated' },
            { contractId: 1, address: '0xCURR', timeStamp: 2000 }, // no status → normalized to mounted
        ];
        const prev = findPreviousGeneration(all, 1);
        expect(prev).not.toBeNull();
        expect(prev.address).toBe('0xOLD');
    });
});

// ─── null contractId vs arkheion-id 0 boundary ────────────────────────────────────

describe('contractId null vs 0 boundary', () => {
    const infraRecord = { name: 'MultiSigWallet', address: '0xMSIG', contractId: null, generation: null, status: 'mounted', timeStamp: 1000, deploySeq: 1, podSnapshot: { active: [], passive: [] } };
    const id0Record = { name: 'ContractZero', address: '0xZERO', contractId: 0, generation: 1, status: 'mounted', timeStamp: 2000, deploySeq: 2, podSnapshot: { active: [], passive: [] } };
    const all = [infraRecord, id0Record];

    it('nextGeneration: null contractId returns null, does not count infra records toward id=0', () => {
        expect(nextGeneration(all, null)).toBeNull();
        expect(nextGeneration(all, 0)).toBe(2); // only id0Record counts
    });

    it('findMounted: null contractId arg returns null', () => {
        expect(findMounted(all, null)).toBeNull();
    });

    it('findMounted: contractId=0 returns id0Record, not infraRecord', () => {
        const result = findMounted(all, 0);
        expect(result).not.toBeNull();
        expect(result.address).toBe('0xZERO');
    });

    it('findGeneration: null contractId returns null', () => {
        expect(findGeneration(all, null, 1)).toBeNull();
    });

    it('findGeneration: contractId=0 finds id0Record', () => {
        const result = findGeneration(all, 0, 1);
        expect(result).not.toBeNull();
        expect(result.address).toBe('0xZERO');
    });

    it('findPreviousGeneration: null contractId returns null', () => {
        expect(findPreviousGeneration(all, null)).toBeNull();
    });

    it('infra record with contractId=null is never matched by numeric contractId lookup', () => {
        // Searching for contractId=0 must not return the infra record
        const mounted = findMounted(all, 0);
        expect(mounted && mounted.name).toBe('ContractZero');
        const gen = findGeneration(all, 0, 1);
        expect(gen && gen.name).toBe('ContractZero');
    });
});
