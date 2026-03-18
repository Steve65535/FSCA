/**
 * Version utilities for M2 rollback/version governance.
 *
 * - generation: per-contractId version counter (only increments when contractId is bound)
 * - deploySeq: global deploy sequence (increments on every deploy, including contractId=null)
 * - normalizeRecord: fills missing fields for backward compatibility
 */

/**
 * Returns the next generation number for a given contractId.
 * Scans alldeployedcontracts for existing generations on that contractId.
 * @param {Array} allDeployed
 * @param {number} contractId
 * @returns {number}
 */
function nextGeneration(allDeployed, contractId) {
    if (contractId === null || contractId === undefined) return null;
    const existing = (allDeployed || [])
        .filter(r => Number(r.contractId) === Number(contractId) && r.generation != null)
        .map(r => r.generation);
    return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/**
 * Returns the next global deploySeq.
 * @param {Array} allDeployed
 * @returns {number}
 */
function nextDeploySeq(allDeployed) {
    const existing = (allDeployed || [])
        .filter(r => r.deploySeq != null)
        .map(r => r.deploySeq);
    return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/**
 * Normalize a legacy record (missing generation/status/podSnapshot).
 * Does NOT mutate the original — returns a new object.
 * @param {object} record
 * @param {'runningcontracts'|'unmountedcontracts'|'alldeployedcontracts'} sourceArray
 * @returns {object}
 */
function normalizeRecord(record, sourceArray) {
    const out = { ...record };

    // status fallback
    if (out.status == null) {
        if (sourceArray === 'runningcontracts') out.status = 'mounted';
        else out.status = 'deployed';
    }

    // generation fallback
    if (out.generation == null) out.generation = null;

    // deploySeq fallback
    if (out.deploySeq == null) out.deploySeq = null;

    // podSnapshot fallback
    if (out.podSnapshot == null) out.podSnapshot = { active: [], passive: [] };

    return out;
}

/**
 * Find the current mounted record for a contractId.
 * Normalizes legacy records (missing status) before comparing.
 * When multiple legacy records normalize to 'mounted', prefers explicit status,
 * then falls back to latest timeStamp.
 * @param {Array} allDeployed
 * @param {number} contractId
 * @returns {object|null}
 */
function findMounted(allDeployed, contractId) {
    const candidates = (allDeployed || []).filter(r => {
        if (r.contractId == null || Number(r.contractId) !== Number(contractId)) return false;
        const normalized = normalizeRecord(r, 'runningcontracts');
        return normalized.status === 'mounted';
    });
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    // Prefer records with explicit 'mounted' status over legacy (no status)
    const explicit = candidates.filter(r => r.status === 'mounted');
    if (explicit.length === 1) return explicit[0];
    // Still ambiguous: return the record with the latest timeStamp
    return candidates.reduce((prev, cur) =>
        (cur.timeStamp || 0) > (prev.timeStamp || 0) ? cur : prev
    );
}

/**
 * Find a specific generation record for a contractId.
 * @param {Array} allDeployed
 * @param {number} contractId
 * @param {number} generation
 * @returns {object|null}
 */
function findGeneration(allDeployed, contractId, generation) {
    return (allDeployed || []).find(
        r => Number(r.contractId) === Number(contractId) && Number(r.generation) === Number(generation)
    ) || null;
}

/**
 * Find the previous generation (current - 1) for a contractId.
 * Falls back to timestamp-based ordering for legacy records without generation.
 * @param {Array} allDeployed
 * @param {number} contractId
 * @returns {object|null}
 */
function findPreviousGeneration(allDeployed, contractId) {
    const mounted = findMounted(allDeployed, contractId);
    if (!mounted) return null;

    const candidates = (allDeployed || []).filter(r =>
        r.contractId != null &&
        Number(r.contractId) === Number(contractId) &&
        r.address &&
        r.address.toLowerCase() !== mounted.address.toLowerCase()
    );

    if (candidates.length === 0) return null;

    // If mounted has a generation, use generation-based lookup
    if (mounted.generation != null && mounted.generation > 1) {
        const byGen = candidates.find(r => Number(r.generation) === mounted.generation - 1);
        if (byGen) return byGen;
    }

    // Fallback: find the most recent deprecated record by timeStamp
    const deprecated = candidates.filter(r => {
        const norm = normalizeRecord(r, 'alldeployedcontracts');
        return norm.status === 'deprecated';
    });
    if (deprecated.length === 0) return null;

    return deprecated.reduce((prev, cur) =>
        (cur.timeStamp || 0) > (prev.timeStamp || 0) ? cur : prev
    );
}

module.exports = {
    nextGeneration,
    nextDeploySeq,
    normalizeRecord,
    findMounted,
    findGeneration,
    findPreviousGeneration,
};
