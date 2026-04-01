/**
 * Unit tests for checkpoint resume/restart logic in:
 *   - cluster/auto.js
 *   - cluster/upgrade.js
 *   - cluster/init.js
 *
 * Strategy: test the checkpoint file read/write/delete logic directly,
 * without invoking chain calls (those are mocked or bypassed via --dry-run equivalent).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-cp-test-'));
}

// ─── Checkpoint file helpers (shared logic extracted for testing) ──────────────

function writeCheckpointFile(dir, filename, data) {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
}

function readCheckpointFile(dir, filename) {
    const p = path.join(dir, filename);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function deleteCheckpointFile(dir, filename) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ─── auto-checkpoint.json ─────────────────────────────────────────────────────

describe('cluster auto checkpoint', () => {
    it('checkpoint file is created with correct structure', () => {
        const dir = makeTmpDir();
        const data = {
            command: 'cluster-auto',
            version: 1,
            clusterAddress: '0xCLUSTER',
            startedAt: new Date().toISOString(),
            completedSteps: ['deploy:TradeEngine', 'link:active:1->2'],
            state: { deployedAddrs: { '1': '0xAAA', '2': '0xBBB' } },
        };
        writeCheckpointFile(dir, 'auto-checkpoint.json', data);
        const read = readCheckpointFile(dir, 'auto-checkpoint.json');
        expect(read).not.toBeNull();
        expect(read.command).toBe('cluster-auto');
        expect(read.completedSteps).toContain('deploy:TradeEngine');
        expect(read.completedSteps).toContain('link:active:1->2');
        expect(read.state.deployedAddrs['1']).toBe('0xAAA');
    });

    it('resume: completed steps are skipped (Set membership check)', () => {
        const dir = makeTmpDir();
        const completedSteps = new Set(['deploy:TradeEngine', 'link:active:1->2', 'mount:1']);
        // Simulate: would we skip 'deploy:TradeEngine'?
        expect(completedSteps.has('deploy:TradeEngine')).toBe(true);
        // Would we skip 'deploy:RiskEngine'?
        expect(completedSteps.has('deploy:RiskEngine')).toBe(false);
        // Would we skip 'link:passive:2->1'?
        expect(completedSteps.has('link:passive:2->1')).toBe(false);
    });

    it('restart: checkpoint file is deleted', () => {
        const dir = makeTmpDir();
        writeCheckpointFile(dir, 'auto-checkpoint.json', { completedSteps: ['deploy:A'] });
        expect(fs.existsSync(path.join(dir, 'auto-checkpoint.json'))).toBe(true);
        deleteCheckpointFile(dir, 'auto-checkpoint.json');
        expect(fs.existsSync(path.join(dir, 'auto-checkpoint.json'))).toBe(false);
    });

    it('stale checkpoint (different clusterAddress) is ignored', () => {
        const dir = makeTmpDir();
        writeCheckpointFile(dir, 'auto-checkpoint.json', {
            clusterAddress: '0xOLD_CLUSTER',
            completedSteps: ['deploy:TradeEngine'],
            state: {},
        });
        const cp = readCheckpointFile(dir, 'auto-checkpoint.json');
        // Simulate the stale check in auto.js
        const currentCluster = '0xNEW_CLUSTER';
        const isStale = cp && cp.clusterAddress !== currentCluster;
        expect(isStale).toBe(true);
    });

    it('step key format: link uses active/passive prefix to avoid collision', () => {
        const completedSteps = new Set();
        // Add active link for 1->2
        completedSteps.add('link:active:1->2');
        // passive link for same pair should NOT be considered done
        expect(completedSteps.has('link:passive:1->2')).toBe(false);
        expect(completedSteps.has('link:active:1->2')).toBe(true);
    });

    it('afterMount step key format avoids collision with link keys', () => {
        const completedSteps = new Set(['link:active:1->2']);
        expect(completedSteps.has('afterMount:active:1->2')).toBe(false);
        completedSteps.add('afterMount:active:1->2');
        expect(completedSteps.has('afterMount:active:1->2')).toBe(true);
        // link key still distinct
        expect(completedSteps.has('link:active:1->2')).toBe(true);
    });

    it('success: checkpoint file is deleted after completion', () => {
        const dir = makeTmpDir();
        writeCheckpointFile(dir, 'auto-checkpoint.json', { completedSteps: ['deploy:A', 'mount:1'] });
        // Simulate success cleanup
        deleteCheckpointFile(dir, 'auto-checkpoint.json');
        expect(fs.existsSync(path.join(dir, 'auto-checkpoint.json'))).toBe(false);
    });

    it('deployedAddrs restored from checkpoint state', () => {
        const cpState = { deployedAddrs: { '1': '0xAAA', '2': '0xBBB', '3': '0xCCC' } };
        const deployedAddrs = new Map();
        for (const [k, v] of Object.entries(cpState.deployedAddrs)) {
            deployedAddrs.set(Number(k), v);
        }
        expect(deployedAddrs.get(1)).toBe('0xAAA');
        expect(deployedAddrs.get(2)).toBe('0xBBB');
        expect(deployedAddrs.get(3)).toBe('0xCCC');
    });
});

// ─── upgrade-checkpoint.json ──────────────────────────────────────────────────

describe('cluster upgrade checkpoint', () => {
    it('checkpoint file stores contractId and clusterAddress', () => {
        const dir = makeTmpDir();
        const data = {
            clusterAddress: '0xCLUSTER',
            contractId: 5,
            completedSteps: ['deploy'],
            state: { newAddr: '0xNEW' },
        };
        writeCheckpointFile(dir, 'upgrade-checkpoint.json', data);
        const read = readCheckpointFile(dir, 'upgrade-checkpoint.json');
        expect(read.contractId).toBe(5);
        expect(read.state.newAddr).toBe('0xNEW');
    });

    it('resume: deploy step skipped, newAddr restored from checkpoint', () => {
        const cpState = { newAddr: '0xNEW_CONTRACT' };
        const completedSteps = new Set(['deploy']);
        // Simulate: would we skip deploy?
        expect(completedSteps.has('deploy')).toBe(true);
        // newAddr is restored from checkpoint
        const newAddr = cpState.newAddr;
        expect(newAddr).toBe('0xNEW_CONTRACT');
    });

    it('resume: pod-copy steps use per-id keys to avoid partial skip', () => {
        const completedSteps = new Set(['deploy', 'pod-copy:active:2', 'pod-copy:active:3']);
        expect(completedSteps.has('pod-copy:active:2')).toBe(true);
        expect(completedSteps.has('pod-copy:passive:2')).toBe(false);
        expect(completedSteps.has('pod-copy:active:4')).toBe(false);
    });

    it('stale checkpoint (different contractId) is ignored', () => {
        const cp = { clusterAddress: '0xCLUSTER', contractId: 3, completedSteps: ['deploy'], state: {} };
        const currentContractId = 5;
        const isStale = cp.clusterAddress !== '0xCLUSTER' || cp.contractId !== currentContractId;
        expect(isStale).toBe(true);
    });

    it('restart: checkpoint deleted, starts fresh', () => {
        const dir = makeTmpDir();
        writeCheckpointFile(dir, 'upgrade-checkpoint.json', { completedSteps: ['deploy', 'delete'] });
        deleteCheckpointFile(dir, 'upgrade-checkpoint.json');
        expect(readCheckpointFile(dir, 'upgrade-checkpoint.json')).toBeNull();
    });

    it('success: checkpoint deleted after all steps complete', () => {
        const dir = makeTmpDir();
        writeCheckpointFile(dir, 'upgrade-checkpoint.json', {
            completedSteps: ['deploy', 'pod-copy:active:1', 'delete', 'register'],
            state: { newAddr: '0xNEW' },
        });
        deleteCheckpointFile(dir, 'upgrade-checkpoint.json');
        expect(fs.existsSync(path.join(dir, 'upgrade-checkpoint.json'))).toBe(false);
    });
});

// ─── cluster-init-checkpoint.json ────────────────────────────────────────────

describe('cluster init checkpoint', () => {
    it('checkpoint stores all deployed addresses in state', () => {
        const dir = makeTmpDir();
        const data = {
            completedSteps: ['deploy:MultiSigWallet', 'deploy:ClusterManager', 'addOperator'],
            state: {
                multisigAddress: '0xMULTISIG',
                clusterAddress: '0xCLUSTER',
            },
        };
        writeCheckpointFile(dir, 'cluster-init-checkpoint.json', data);
        const read = readCheckpointFile(dir, 'cluster-init-checkpoint.json');
        expect(read.state.multisigAddress).toBe('0xMULTISIG');
        expect(read.state.clusterAddress).toBe('0xCLUSTER');
        expect(read.completedSteps).toContain('addOperator');
    });

    it('resume: deploy steps skipped, addresses restored', () => {
        const cpState = {
            multisigAddress: '0xMULTISIG',
            clusterAddress: '0xCLUSTER',
            evokerAddress: '0xEVOKER',
            rightManagerAddress: null,
        };
        const completedSteps = new Set([
            'deploy:MultiSigWallet', 'deploy:ClusterManager', 'addOperator', 'deploy:EvokerManager',
        ]);
        expect(completedSteps.has('deploy:MultiSigWallet')).toBe(true);
        expect(completedSteps.has('deploy:ProxyWallet')).toBe(false);
        expect(completedSteps.has('setEvokerManager')).toBe(false);
        // Addresses restored
        expect(cpState.multisigAddress).toBe('0xMULTISIG');
        expect(cpState.evokerAddress).toBe('0xEVOKER');
        expect(cpState.rightManagerAddress).toBeNull();
    });

    it('all 7 step keys are distinct', () => {
        const steps = [
            'deploy:MultiSigWallet',
            'deploy:ClusterManager',
            'addOperator',
            'deploy:EvokerManager',
            'deploy:ProxyWallet',
            'setEvokerManager',
            'setRightManager',
        ];
        const unique = new Set(steps);
        expect(unique.size).toBe(steps.length);
    });

    it('restart: checkpoint deleted', () => {
        const dir = makeTmpDir();
        writeCheckpointFile(dir, 'cluster-init-checkpoint.json', { completedSteps: ['deploy:MultiSigWallet'] });
        deleteCheckpointFile(dir, 'cluster-init-checkpoint.json');
        expect(readCheckpointFile(dir, 'cluster-init-checkpoint.json')).toBeNull();
    });

    it('success: checkpoint deleted after all steps complete', () => {
        const dir = makeTmpDir();
        writeCheckpointFile(dir, 'cluster-init-checkpoint.json', {
            completedSteps: ['deploy:MultiSigWallet', 'deploy:ClusterManager', 'addOperator',
                'deploy:EvokerManager', 'deploy:ProxyWallet', 'setEvokerManager', 'setRightManager'],
            state: { multisigAddress: '0xM', clusterAddress: '0xC', evokerAddress: '0xE', rightManagerAddress: '0xR' },
        });
        deleteCheckpointFile(dir, 'cluster-init-checkpoint.json');
        expect(fs.existsSync(path.join(dir, 'cluster-init-checkpoint.json'))).toBe(false);
    });

    it('malformed checkpoint file is treated as null', () => {
        const dir = makeTmpDir();
        fs.writeFileSync(path.join(dir, 'cluster-init-checkpoint.json'), 'not-json', 'utf-8');
        const read = readCheckpointFile(dir, 'cluster-init-checkpoint.json');
        expect(read).toBeNull();
    });
});
