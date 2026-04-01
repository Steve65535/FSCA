/**
 * Command Prerequisite State Machine
 *
 * Infers project state from project.json and enforces
 * command prerequisites at the executor level.
 */

const fs = require('fs');
const path = require('path');

/**
 * Project states (ordered by progression):
 *   uninitialized → initialized → cluster_ready
 *
 * Additional fine-grained requirement:
 *   current_contract_selected — requires arkheion.currentOperating set
 */

function inferState(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        return { level: 'uninitialized', config: null };
    }

    let config;
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
        return { level: 'uninitialized', config: null };
    }

    // initialized: network + account must exist
    if (!config.network || !config.account) {
        return { level: 'uninitialized', config };
    }

    // cluster_ready: all 4 infra addresses must exist
    const arkheion = config.arkheion || {};
    const hasCluster =
        arkheion.clusterAddress &&
        (arkheion.multisigAddress || arkheion.multiSigAddress) &&
        arkheion.evokerManagerAddress &&
        arkheion.rightManagerAddress;

    if (!hasCluster) {
        return { level: 'initialized', config };
    }

    return { level: 'cluster_ready', config };
}

/**
 * Check if currentOperating is set
 */
function hasCurrentContract(config) {
    return !!(config && config.arkheion && config.arkheion.currentOperating);
}

const STATE_ORDER = ['uninitialized', 'initialized', 'cluster_ready'];

const REMEDIATION = {
    initialized: 'Run "arkheion init" first.',
    cluster_ready: 'Run "arkheion cluster init" first.',
    current_contract_selected: 'Run "arkheion cluster choose <address>" first.',
};

/**
 * Assert that all prerequisites are met.
 * @param {string} rootDir
 * @param {string[]} requires - e.g. ['cluster_ready', 'current_contract_selected']
 * @returns {{ ok: boolean, message?: string }}
 */
function assertPrerequisites(rootDir, requires) {
    if (!requires || requires.length === 0) {
        return { ok: true };
    }

    const { level, config } = inferState(rootDir);
    const currentIdx = STATE_ORDER.indexOf(level);

    for (const req of requires) {
        if (req === 'current_contract_selected') {
            // current_contract_selected implies cluster_ready
            const clusterIdx = STATE_ORDER.indexOf('cluster_ready');
            if (currentIdx < clusterIdx) {
                return { ok: false, message: REMEDIATION['cluster_ready'] };
            }
            if (!hasCurrentContract(config)) {
                return { ok: false, message: REMEDIATION['current_contract_selected'] };
            }
            continue;
        }

        const reqIdx = STATE_ORDER.indexOf(req);
        if (reqIdx === -1) continue; // unknown requirement, skip
        if (currentIdx < reqIdx) {
            return { ok: false, message: REMEDIATION[req] };
        }
    }

    return { ok: true };
}

module.exports = { inferState, assertPrerequisites };
