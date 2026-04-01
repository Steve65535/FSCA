/**
 * 集群级并发锁（基于文件系统）
 * 锁文件：<rootDir>/.arkheion-cluster.lock
 * 孤儿锁回收：PID 不存在时强制清除
 * 无 TTL — 锁永久有效直到进程主动释放或被孤儿检测清除
 */

const fs = require('fs');
const path = require('path');

const LOCK_FILE = '.arkheion-cluster.lock';

function lockPath(rootDir) {
    return path.join(rootDir, LOCK_FILE);
}

/**
 * 检查 PID 是否存活
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 读取现有锁文件内容，返回 null 若不存在或解析失败
 */
function readLock(rootDir) {
    const p = lockPath(rootDir);
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
        return null;
    }
}

/**
 * 获取集群锁。若锁被活跃进程持有，抛出错误。
 * @param {string} rootDir
 * @param {string} lockKey  — clusterAddress 或 path.resolve(rootDir)
 * @param {string} commandName
 * @returns {{ release: Function }}
 */
function acquireLock(rootDir, lockKey, commandName) {
    const p = lockPath(rootDir);

    // Attempt atomic create
    try {
        const data = JSON.stringify({
            pid: process.pid,
            command: commandName,
            clusterAddress: lockKey,
            acquiredAt: new Date().toISOString(),
        }, null, 2);
        fs.writeFileSync(p, data, { flag: 'wx' });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;

        // Lock file exists — check if holder is alive
        const existing = readLock(rootDir);
        if (existing && isPidAlive(existing.pid)) {
            throw new Error(
                `Cluster lock held by PID ${existing.pid} (${existing.command}, started ${existing.acquiredAt}). ` +
                `If that process is no longer running, delete ${p} manually.`
            );
        }

        // Orphan lock — force clear and retry
        console.warn(`  [lock] Orphan lock detected (PID ${existing && existing.pid}), clearing.`);
        try { fs.unlinkSync(p); } catch { /* ignore */ }

        const data = JSON.stringify({
            pid: process.pid,
            command: commandName,
            clusterAddress: lockKey,
            acquiredAt: new Date().toISOString(),
        }, null, 2);
        fs.writeFileSync(p, data, { flag: 'wx' });
    }

    console.log(`  [lock] Acquired by PID ${process.pid} (${commandName})`);

    let released = false;

    function release() {
        if (released) return;
        released = true;
        try { fs.unlinkSync(p); } catch { /* ignore */ }
        console.log(`  [lock] Released by PID ${process.pid}`);
    }

    // Auto-release on process exit
    process.once('exit', release);

    return { release };
}

module.exports = { acquireLock };
