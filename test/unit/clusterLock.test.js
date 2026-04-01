/**
 * Unit tests for clusterLock.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We require the module fresh each test via a helper to avoid process.once('exit') stacking
function getLock() {
    // Clear require cache so process.once is re-registered cleanly
    const modPath = require.resolve('../../libs/commands/clusterLock');
    delete require.cache[modPath];
    return require('../../libs/commands/clusterLock');
}

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-lock-test-'));
}

describe('clusterLock', () => {
    it('acquires and releases lock normally', () => {
        const dir = makeTmpDir();
        const { acquireLock } = getLock();
        const lock = acquireLock(dir, '0xCLUSTER', 'test-cmd');
        const lockFile = path.join(dir, '.arkheion-cluster.lock');
        assert.ok(fs.existsSync(lockFile), 'lock file should exist');
        const data = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
        assert.strictEqual(data.pid, process.pid);
        assert.strictEqual(data.command, 'test-cmd');
        lock.release();
        assert.ok(!fs.existsSync(lockFile), 'lock file should be removed after release');
    });

    it('throws when lock is held by alive process', () => {
        const dir = makeTmpDir();
        const { acquireLock } = getLock();
        const lock = acquireLock(dir, '0xCLUSTER', 'cmd-a');
        try {
            assert.throws(
                () => acquireLock(dir, '0xCLUSTER', 'cmd-b'),
                /Cluster lock held by PID/
            );
        } finally {
            lock.release();
        }
    });

    it('clears orphan lock (dead PID) and acquires', () => {
        const dir = makeTmpDir();
        const lockFile = path.join(dir, '.arkheion-cluster.lock');
        // Write a lock with a PID that definitely does not exist
        fs.writeFileSync(lockFile, JSON.stringify({
            pid: 999999999,
            command: 'old-cmd',
            clusterAddress: '0xCLUSTER',
            acquiredAt: new Date().toISOString(),
        }), 'utf-8');

        const { acquireLock } = getLock();
        const lock = acquireLock(dir, '0xCLUSTER', 'new-cmd');
        assert.ok(fs.existsSync(lockFile), 'new lock file should exist');
        const data = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
        assert.strictEqual(data.pid, process.pid);
        lock.release();
    });

    it('release is idempotent (no throw on double release)', () => {
        const dir = makeTmpDir();
        const { acquireLock } = getLock();
        const lock = acquireLock(dir, '0xCLUSTER', 'test-cmd');
        lock.release();
        assert.doesNotThrow(() => lock.release());
    });

    it('clears malformed lock file and acquires', () => {
        const dir = makeTmpDir();
        const lockFile = path.join(dir, '.arkheion-cluster.lock');
        fs.writeFileSync(lockFile, 'not-valid-json', 'utf-8');

        const { acquireLock } = getLock();
        // readLock returns null for malformed JSON, isPidAlive(null.pid) would throw
        // so we expect it to treat as orphan and clear
        const lock = acquireLock(dir, '0xCLUSTER', 'test-cmd');
        assert.ok(fs.existsSync(lockFile));
        lock.release();
    });
});
