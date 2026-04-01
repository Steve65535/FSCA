/**
 * Unit tests for libs/commands/cleanup.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    resolveCleanupMode,
    performCleanup,
    findSourceFile,
    findArtifactFile,
} = require('../../libs/commands/cleanup');

function makeTmpProject(files) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-cleanup-test-'));
    for (const [relPath, content] of Object.entries(files)) {
        const full = path.join(tmpDir, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf-8');
    }
    return tmpDir;
}

function cleanup(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

// ─── resolveCleanupMode ───────────────────────────────────────────────────────

describe('resolveCleanupMode', () => {
    it('returns keep when no args and no config', () => {
        expect(resolveCleanupMode({}, {})).toBe('keep');
    });

    it('returns keep when args and config are undefined', () => {
        expect(resolveCleanupMode(undefined, undefined)).toBe('keep');
    });

    it('CLI arg overrides config', () => {
        const config = { arkheion: { cleanupPolicy: { defaultMode: 'soft' } } };
        expect(resolveCleanupMode({ cleanup: 'hard' }, config)).toBe('hard');
    });

    it('config is used when no CLI arg', () => {
        const config = { arkheion: { cleanupPolicy: { defaultMode: 'soft' } } };
        expect(resolveCleanupMode({}, config)).toBe('soft');
    });

    it('throws on invalid mode', () => {
        expect(() => resolveCleanupMode({ cleanup: 'nuke' }, {})).toThrow(/Invalid cleanup mode/);
    });

    it('all three valid modes are accepted', () => {
        for (const m of ['keep', 'soft', 'hard']) {
            expect(resolveCleanupMode({ cleanup: m }, {})).toBe(m);
        }
    });
});

// ─── findSourceFile ───────────────────────────────────────────────────────────

describe('findSourceFile', () => {
    it('finds file at root of undeployed/', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/Foo.sol': 'contract Foo {}' });
        try {
            expect(findSourceFile(dir, 'Foo')).toBe(path.join(dir, 'contracts', 'undeployed', 'Foo.sol'));
        } finally { cleanup(dir); }
    });

    it('finds file case-insensitively (CamelCase name, lowercase filename)', () => {
        // Simulates ClusterManager -> clustermanager.sol scenario
        const dir = makeTmpProject({ 'contracts/undeployed/structure/clustermanager.sol': 'contract ClusterManager {}' });
        try {
            const result = findSourceFile(dir, 'ClusterManager');
            expect(result).not.toBeNull();
            expect(result.toLowerCase()).toContain('clustermanager.sol');
        } finally { cleanup(dir); }
    });

    it('finds file case-insensitively in wallet/ subdirectory', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/wallet/multisigwallet.sol': 'contract MultiSigWallet {}' });
        try {
            const result = findSourceFile(dir, 'MultiSigWallet');
            expect(result).not.toBeNull();
            expect(result.toLowerCase()).toContain('multisigwallet.sol');
        } finally { cleanup(dir); }
    });

    it('finds file in lib/ subdirectory', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/lib/Bar.sol': 'contract Bar {}' });
        try {
            expect(findSourceFile(dir, 'Bar')).toBe(path.join(dir, 'contracts', 'undeployed', 'lib', 'Bar.sol'));
        } finally { cleanup(dir); }
    });

    it('finds file in structure/ subdirectory', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/structure/CM.sol': 'contract CM {}' });
        try {
            expect(findSourceFile(dir, 'CM')).toBe(path.join(dir, 'contracts', 'undeployed', 'structure', 'CM.sol'));
        } finally { cleanup(dir); }
    });

    it('finds file in wallet/ subdirectory', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/wallet/MW.sol': 'contract MW {}' });
        try {
            expect(findSourceFile(dir, 'MW')).toBe(path.join(dir, 'contracts', 'undeployed', 'wallet', 'MW.sol'));
        } finally { cleanup(dir); }
    });

    it('returns null when file does not exist', () => {
        const dir = makeTmpProject({});
        try {
            expect(findSourceFile(dir, 'Ghost')).toBeNull();
        } finally { cleanup(dir); }
    });
});

// ─── findArtifactFile ─────────────────────────────────────────────────────────

describe('findArtifactFile', () => {
    it('finds artifact at root of undeployed/', () => {
        const dir = makeTmpProject({
            'artifacts/contracts/undeployed/Foo.sol/Foo.json': '{}',
        });
        try {
            expect(findArtifactFile(dir, 'Foo')).toBe(
                path.join(dir, 'artifacts', 'contracts', 'undeployed', 'Foo.sol', 'Foo.json')
            );
        } finally { cleanup(dir); }
    });

    it('finds artifact in lib/ subdirectory', () => {
        const dir = makeTmpProject({
            'artifacts/contracts/undeployed/lib/Bar.sol/Bar.json': '{}',
        });
        try {
            expect(findArtifactFile(dir, 'Bar')).toBe(
                path.join(dir, 'artifacts', 'contracts', 'undeployed', 'lib', 'Bar.sol', 'Bar.json')
            );
        } finally { cleanup(dir); }
    });

    it('returns null when artifact does not exist', () => {
        const dir = makeTmpProject({});
        try {
            expect(findArtifactFile(dir, 'Ghost')).toBeNull();
        } finally { cleanup(dir); }
    });
});

// ─── performCleanup — keep ────────────────────────────────────────────────────

describe('performCleanup keep', () => {
    it('returns empty actions and errors', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/Foo.sol': 'contract Foo {}' });
        try {
            const src = path.join(dir, 'contracts', 'undeployed', 'Foo.sol');
            const { actions, errors } = performCleanup({
                mode: 'keep',
                files: [{ sourcePath: src, artifactPath: null, contractName: 'Foo' }],
                rootDir: dir,
            });
            expect(actions).toHaveLength(0);
            expect(errors).toHaveLength(0);
            expect(fs.existsSync(src)).toBe(true);
        } finally { cleanup(dir); }
    });
});

// ─── performCleanup — soft ────────────────────────────────────────────────────

describe('performCleanup soft', () => {
    it('moves source file to archived/ and removes original', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/Foo.sol': 'contract Foo {}' });
        try {
            const src = path.join(dir, 'contracts', 'undeployed', 'Foo.sol');
            const { actions, errors } = performCleanup({
                mode: 'soft',
                files: [{ sourcePath: src, artifactPath: null, contractName: 'Foo' }],
                rootDir: dir,
            });
            expect(errors).toHaveLength(0);
            expect(actions[0].status).toBe('ok');
            expect(actions[0].action).toBe('archived');
            expect(fs.existsSync(src)).toBe(false);
            expect(fs.existsSync(actions[0].to)).toBe(true);
        } finally { cleanup(dir); }
    });

    it('preserves subdirectory structure (lib/)', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/lib/Bar.sol': 'contract Bar {}' });
        try {
            const src = path.join(dir, 'contracts', 'undeployed', 'lib', 'Bar.sol');
            const { actions } = performCleanup({
                mode: 'soft',
                files: [{ sourcePath: src, artifactPath: null, contractName: 'Bar' }],
                rootDir: dir,
            });
            expect(actions[0].status).toBe('ok');
            expect(actions[0].to).toContain(path.join('lib', 'Bar.sol'));
        } finally { cleanup(dir); }
    });

    it('marks already-deleted file as skipped (idempotent)', () => {
        const dir = makeTmpProject({});
        try {
            const src = path.join(dir, 'contracts', 'undeployed', 'Ghost.sol');
            const { actions, errors } = performCleanup({
                mode: 'soft',
                files: [{ sourcePath: src, artifactPath: null, contractName: 'Ghost' }],
                rootDir: dir,
            });
            expect(errors).toHaveLength(0);
            expect(actions[0].status).toBe('skipped');
        } finally { cleanup(dir); }
    });
});

// ─── performCleanup — hard ────────────────────────────────────────────────────

describe('performCleanup hard', () => {
    it('deletes source file', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/Foo.sol': 'contract Foo {}' });
        try {
            const src = path.join(dir, 'contracts', 'undeployed', 'Foo.sol');
            const { actions, errors } = performCleanup({
                mode: 'hard',
                files: [{ sourcePath: src, artifactPath: null, contractName: 'Foo' }],
                rootDir: dir,
            });
            expect(errors).toHaveLength(0);
            expect(actions[0].status).toBe('ok');
            expect(fs.existsSync(src)).toBe(false);
        } finally { cleanup(dir); }
    });

    it('deletes artifact file', () => {
        const dir = makeTmpProject({
            'artifacts/contracts/undeployed/Foo.sol/Foo.json': '{}',
        });
        try {
            const art = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'Foo.sol', 'Foo.json');
            const { actions, errors } = performCleanup({
                mode: 'hard',
                files: [{ sourcePath: null, artifactPath: art, contractName: 'Foo' }],
                rootDir: dir,
            });
            expect(errors).toHaveLength(0);
            expect(actions[0].status).toBe('ok');
            expect(fs.existsSync(art)).toBe(false);
        } finally { cleanup(dir); }
    });

    it('also deletes .dbg.json sibling', () => {
        const dir = makeTmpProject({
            'artifacts/contracts/undeployed/Foo.sol/Foo.json': '{}',
            'artifacts/contracts/undeployed/Foo.sol/Foo.dbg.json': '{}',
        });
        try {
            const art = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'Foo.sol', 'Foo.json');
            const dbg = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'Foo.sol', 'Foo.dbg.json');
            performCleanup({
                mode: 'hard',
                files: [{ sourcePath: null, artifactPath: art, contractName: 'Foo' }],
                rootDir: dir,
            });
            expect(fs.existsSync(dbg)).toBe(false);
        } finally { cleanup(dir); }
    });

    it('does not delete parent directory', () => {
        const dir = makeTmpProject({
            'contracts/undeployed/Foo.sol': 'contract Foo {}',
            'contracts/undeployed/Other.sol': 'contract Other {}',
        });
        try {
            const src = path.join(dir, 'contracts', 'undeployed', 'Foo.sol');
            performCleanup({
                mode: 'hard',
                files: [{ sourcePath: src, artifactPath: null, contractName: 'Foo' }],
                rootDir: dir,
            });
            const undeployedDir = path.join(dir, 'contracts', 'undeployed');
            expect(fs.existsSync(undeployedDir)).toBe(true);
            expect(fs.existsSync(path.join(undeployedDir, 'Other.sol'))).toBe(true);
        } finally { cleanup(dir); }
    });

    it('marks already-deleted file as skipped (idempotent)', () => {
        const dir = makeTmpProject({});
        try {
            const src = path.join(dir, 'contracts', 'undeployed', 'Ghost.sol');
            const { actions, errors } = performCleanup({
                mode: 'hard',
                files: [{ sourcePath: src, artifactPath: null, contractName: 'Ghost' }],
                rootDir: dir,
            });
            expect(errors).toHaveLength(0);
            expect(actions[0].status).toBe('skipped');
        } finally { cleanup(dir); }
    });
});

// ─── Safety checks ────────────────────────────────────────────────────────────

describe('performCleanup safety', () => {
    it('rejects symlinks', () => {
        const dir = makeTmpProject({ 'contracts/undeployed/Real.sol': 'contract Real {}' });
        try {
            const real = path.join(dir, 'contracts', 'undeployed', 'Real.sol');
            const link = path.join(dir, 'contracts', 'undeployed', 'Link.sol');
            fs.symlinkSync(real, link);
            const { actions, errors } = performCleanup({
                mode: 'hard',
                files: [{ sourcePath: link, artifactPath: null, contractName: 'Link' }],
                rootDir: dir,
            });
            expect(actions[0].status).toBe('error');
            expect(errors.length).toBeGreaterThan(0);
            expect(fs.existsSync(real)).toBe(true); // original untouched
        } finally { cleanup(dir); }
    });

    it('rejects directory symlink pointing outside repo (escape attack)', () => {
        // Create an "outside" directory with a victim file
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-outside-'));
        const victimPath = path.join(outside, 'Victim.sol');
        fs.writeFileSync(victimPath, 'contract Victim {}', 'utf-8');

        // Create project where contracts/undeployed is a symlink to outside/
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-cleanup-test-'));
        fs.mkdirSync(path.join(dir, 'contracts'), { recursive: true });
        const undeployedLink = path.join(dir, 'contracts', 'undeployed');
        fs.symlinkSync(outside, undeployedLink);

        try {
            const escapedPath = path.join(undeployedLink, 'Victim.sol');
            const { actions, errors } = performCleanup({
                mode: 'hard',
                files: [{ sourcePath: escapedPath, artifactPath: null, contractName: 'Victim' }],
                rootDir: dir,
            });
            expect(actions[0].status).toBe('error');
            expect(errors.length).toBeGreaterThan(0);
            // Victim file must NOT have been deleted
            expect(fs.existsSync(victimPath)).toBe(true);
        } finally {
            cleanup(dir);
            cleanup(outside);
        }
    });

    it('rejects path outside contracts/undeployed/', () => {
        const dir = makeTmpProject({ 'contracts/deployed/Foo.sol': 'contract Foo {}' });
        try {
            const outsidePath = path.join(dir, 'contracts', 'deployed', 'Foo.sol');
            const { actions, errors } = performCleanup({
                mode: 'hard',
                files: [{ sourcePath: outsidePath, artifactPath: null, contractName: 'Foo' }],
                rootDir: dir,
            });
            expect(actions[0].status).toBe('error');
            expect(errors.length).toBeGreaterThan(0);
            expect(fs.existsSync(outsidePath)).toBe(true);
        } finally { cleanup(dir); }
    });
});
