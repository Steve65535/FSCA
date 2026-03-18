/**
 * Cleanup utility — post-deploy source/artifact cleanup
 * Modes: keep (default) | soft (archive) | hard (delete)
 */

const fs = require('fs');
const path = require('path');

const VALID_MODES = ['keep', 'soft', 'hard'];

/**
 * Resolve cleanup mode: CLI arg > project.json config > 'keep'
 */
function resolveCleanupMode(args, projectConfig) {
    const fromArgs = args && args.cleanup;
    const fromConfig = projectConfig && projectConfig.fsca && projectConfig.fsca.cleanupPolicy && projectConfig.fsca.cleanupPolicy.defaultMode;
    const mode = fromArgs || fromConfig || 'keep';
    if (!VALID_MODES.includes(mode)) {
        throw new Error(`Invalid cleanup mode "${mode}". Must be one of: keep, soft, hard`);
    }
    return mode;
}

/**
 * Case-insensitive file lookup within a directory.
 * Returns the real path if found, null otherwise.
 */
function findCaseInsensitive(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    const lower = filename.toLowerCase();
    const entries = fs.readdirSync(dir);
    const match = entries.find(e => e.toLowerCase() === lower);
    return match ? path.join(dir, match) : null;
}

/**
 * Find .sol source file under contracts/undeployed/
 * Tries exact match first, then case-insensitive fallback.
 */
function findSourceFile(rootDir, contractName) {
    const base = path.join(rootDir, 'contracts', 'undeployed');
    const subdirs = ['', 'lib', 'structure', 'wallet'];
    for (const sub of subdirs) {
        const dir = sub ? path.join(base, sub) : base;
        // exact match
        const exact = path.join(dir, `${contractName}.sol`);
        if (fs.existsSync(exact)) return exact;
        // case-insensitive fallback
        const ci = findCaseInsensitive(dir, `${contractName}.sol`);
        if (ci) return ci;
    }
    return null;
}

/**
 * Find compiled artifact under artifacts/contracts/undeployed/
 * Tries exact match first, then case-insensitive fallback.
 */
function findArtifactFile(rootDir, contractName) {
    const base = path.join(rootDir, 'artifacts', 'contracts', 'undeployed');
    const subdirs = ['', 'lib', 'structure', 'wallet'];
    for (const sub of subdirs) {
        const solDir = sub
            ? path.join(base, sub, `${contractName}.sol`)
            : path.join(base, `${contractName}.sol`);
        // exact match
        const exact = path.join(solDir, `${contractName}.json`);
        if (fs.existsSync(exact)) return exact;
        // case-insensitive fallback: find the .sol directory, then the .json inside
        const parentDir = path.dirname(solDir);
        const ciSolDir = findCaseInsensitive(parentDir, `${contractName}.sol`);
        if (ciSolDir) {
            const ciJson = findCaseInsensitive(ciSolDir, `${contractName}.json`);
            if (ciJson) return ciJson;
        }
    }
    return null;
}

/**
 * Safety check: path must be inside an allowed root prefix,
 * and no ancestor directory along the path may be a symlink.
 */
function assertSafePath(filePath, rootDir, allowedSubdirs) {
    const resolved = path.resolve(filePath);
    const allowed = allowedSubdirs.map(d => path.resolve(rootDir, d));
    if (!allowed.some(a => resolved.startsWith(a + path.sep) || resolved === a)) {
        throw new Error(`Path safety violation: "${filePath}" is outside allowed directories`);
    }
    // Walk every ancestor from rootDir down to the file's parent and reject symlinks
    const absRoot = path.resolve(rootDir);
    let current = path.dirname(resolved);
    while (current.startsWith(absRoot) && current !== absRoot) {
        try {
            if (fs.lstatSync(current).isSymbolicLink()) {
                throw new Error(`Path safety violation: ancestor directory is a symlink: "${current}"`);
            }
        } catch (e) {
            if (e.message.includes('symlink')) throw e;
            // directory doesn't exist yet — safe to continue
        }
        current = path.dirname(current);
    }
}

/**
 * Perform cleanup for a list of files.
 * @param {object} opts
 * @param {'keep'|'soft'|'hard'} opts.mode
 * @param {Array<{sourcePath: string|null, artifactPath: string|null, contractName: string}>} opts.files
 * @param {string} opts.rootDir
 * @returns {{ actions: Array, errors: Array }}
 */
function performCleanup({ mode, files, rootDir }) {
    const actions = [];
    const errors = [];

    if (mode === 'keep') return { actions, errors };

    const timestamp = Date.now();
    const archiveBase = mode === 'soft'
        ? path.join(rootDir, 'contracts', 'archived', String(timestamp))
        : null;

    for (const { sourcePath, artifactPath, contractName } of files) {
        // Process source file
        if (sourcePath) {
            const result = _processFile({
                filePath: sourcePath,
                rootDir,
                mode,
                archiveBase,
                allowedSubdirs: [path.join('contracts', 'undeployed')],
                contractName,
                fileType: 'source',
            });
            actions.push(result);
            if (result.status === 'error') {
                errors.push(result.error);
                continue; // abort artifact cleanup for this contract on error
            }
        }

        // Process artifact file
        if (artifactPath) {
            const result = _processFile({
                filePath: artifactPath,
                rootDir,
                mode,
                archiveBase,
                allowedSubdirs: [path.join('artifacts', 'contracts', 'undeployed')],
                contractName,
                fileType: 'artifact',
            });
            actions.push(result);
            if (result.status === 'error') errors.push(result.error);

            // Also remove .dbg.json sibling for hard mode
            if (mode === 'hard' && result.status === 'ok') {
                const dbgPath = artifactPath.replace(/\.json$/, '.dbg.json');
                if (fs.existsSync(dbgPath)) {
                    try {
                        fs.unlinkSync(dbgPath);
                        actions.push({ contractName, fileType: 'artifact-dbg', action: 'deleted', from: dbgPath, status: 'ok' });
                    } catch (e) {
                        errors.push(e.message);
                    }
                }
            }
        }
    }

    return { actions, errors };
}

function _processFile({ filePath, rootDir, mode, archiveBase, allowedSubdirs, contractName, fileType }) {
    // 1. Existence check (idempotent)
    if (!fs.existsSync(filePath)) {
        return { contractName, fileType, action: mode === 'soft' ? 'archived' : 'deleted', from: filePath, status: 'skipped', reason: 'not found' };
    }

    // 2. Path safety check
    try {
        assertSafePath(filePath, rootDir, allowedSubdirs);
    } catch (e) {
        return { contractName, fileType, action: 'rejected', from: filePath, status: 'error', error: e.message };
    }

    // 3. Symlink check
    try {
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) {
            return { contractName, fileType, action: 'rejected', from: filePath, status: 'error', error: `Refusing to process symlink: ${filePath}` };
        }
    } catch (e) {
        return { contractName, fileType, action: 'rejected', from: filePath, status: 'error', error: e.message };
    }

    if (mode === 'soft') {
        // Preserve subdirectory structure relative to contracts/undeployed or artifacts/contracts/undeployed
        const undeployedRoot = allowedSubdirs[0]; // single entry
        const absUndeployedRoot = path.resolve(rootDir, undeployedRoot);
        const absFile = path.resolve(filePath);
        const rel = path.relative(absUndeployedRoot, absFile);
        const dest = path.join(archiveBase, rel);
        try {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(filePath, dest);
            fs.unlinkSync(filePath);
            return { contractName, fileType, action: 'archived', from: filePath, to: dest, status: 'ok' };
        } catch (e) {
            return { contractName, fileType, action: 'archived', from: filePath, status: 'error', error: e.message };
        }
    }

    if (mode === 'hard') {
        try {
            fs.unlinkSync(filePath);
            return { contractName, fileType, action: 'deleted', from: filePath, status: 'ok' };
        } catch (e) {
            return { contractName, fileType, action: 'deleted', from: filePath, status: 'error', error: e.message };
        }
    }

    return { contractName, fileType, action: 'noop', from: filePath, status: 'skipped' };
}

module.exports = { resolveCleanupMode, performCleanup, findSourceFile, findArtifactFile };
