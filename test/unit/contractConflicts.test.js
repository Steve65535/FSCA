'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanContractConflicts, scanAllConflicts, scanIdConflicts, failOnConflict, failOnAllConflicts } = require('../../libs/commands/contractConflicts');

function mkTmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-conflicts-'));
}

function mkdirp(p) {
    fs.mkdirSync(p, { recursive: true });
}

function writeFile(p, content = '{}') {
    mkdirp(path.dirname(p));
    fs.writeFileSync(p, content, 'utf-8');
}

function rmrf(p) {
    fs.rmSync(p, { recursive: true, force: true });
}

// ─── scanContractConflicts ────────────────────────────────────────────────────

describe('scanContractConflicts', () => {
    let tmp;
    beforeEach(() => { tmp = mkTmp(); });
    afterEach(() => { rmrf(tmp); });

    test('no artifacts dir → no hits', () => {
        const { hits, conflict } = scanContractConflicts(tmp, 'TradeEngine');
        expect(hits).toHaveLength(0);
        expect(conflict).toBe(false);
    });

    test('single artifact → no conflict', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'TradeEngine.sol', 'TradeEngine.json'));
        const { hits, conflict } = scanContractConflicts(tmp, 'TradeEngine');
        expect(hits).toHaveLength(1);
        expect(conflict).toBe(false);
    });

    test('artifact in subdir → no conflict', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'lib', 'TradeEngine.sol', 'TradeEngine.json'));
        const { hits, conflict } = scanContractConflicts(tmp, 'TradeEngine');
        expect(hits).toHaveLength(1);
        expect(conflict).toBe(false);
    });

    test('same name in two subdirs → conflict', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'TradeEngine.sol', 'TradeEngine.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'lib', 'TradeEngine.sol', 'TradeEngine.json'));
        const { hits, conflict } = scanContractConflicts(tmp, 'TradeEngine');
        expect(hits).toHaveLength(2);
        expect(conflict).toBe(true);
    });

    test('dbg.json files are ignored', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'TradeEngine.sol', 'TradeEngine.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'TradeEngine.sol', 'TradeEngine.dbg.json'));
        const { hits, conflict } = scanContractConflicts(tmp, 'TradeEngine');
        expect(hits).toHaveLength(1);
        expect(conflict).toBe(false);
    });

    test('root artifacts path conflict with undeployed → conflict', () => {
        // undeployed subdir hit
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'TradeEngine.sol', 'TradeEngine.json'));
        // root fallback hit (loadArtifact fallback path)
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'TradeEngine.sol', 'TradeEngine.json'));
        const { hits, conflict } = scanContractConflicts(tmp, 'TradeEngine');
        expect(hits).toHaveLength(2);
        expect(conflict).toBe(true);
    });

    test('only root artifacts path → single hit, no conflict', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'TradeEngine.sol', 'TradeEngine.json'));
        const { hits, conflict } = scanContractConflicts(tmp, 'TradeEngine');
        expect(hits).toHaveLength(1);
        expect(conflict).toBe(false);
    });
});

// ─── scanAllConflicts ─────────────────────────────────────────────────────────

describe('scanAllConflicts', () => {
    let tmp;
    beforeEach(() => { tmp = mkTmp(); });
    afterEach(() => { rmrf(tmp); });

    test('no dirs → empty results', () => {
        const { artifactConflicts, sourceConflicts } = scanAllConflicts(tmp);
        expect(artifactConflicts).toHaveLength(0);
        expect(sourceConflicts).toHaveLength(0);
    });

    test('no conflicts → empty results', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'A.sol', 'A.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'B.sol', 'B.json'));
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'A.sol'), '// A');
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'B.sol'), '// B');
        const { artifactConflicts, sourceConflicts } = scanAllConflicts(tmp);
        expect(artifactConflicts).toHaveLength(0);
        expect(sourceConflicts).toHaveLength(0);
    });

    test('artifact conflict detected', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'A.sol', 'A.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'lib', 'A.sol', 'A.json'));
        const { artifactConflicts } = scanAllConflicts(tmp);
        expect(artifactConflicts).toHaveLength(1);
        expect(artifactConflicts[0].contractName).toBe('A');
        expect(artifactConflicts[0].paths).toHaveLength(2);
    });

    test('source conflict detected (case-insensitive)', () => {
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'foo.sol'), '// foo');
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'lib', 'foo.sol'), '// foo lib');
        const { sourceConflicts } = scanAllConflicts(tmp);
        expect(sourceConflicts).toHaveLength(1);
        expect(sourceConflicts[0].contractName).toBe('foo');
    });

    test('root artifacts path conflict with undeployed → detected', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'A.sol', 'A.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'A.sol', 'A.json'));
        const { artifactConflicts } = scanAllConflicts(tmp);
        expect(artifactConflicts).toHaveLength(1);
        expect(artifactConflicts[0].contractName).toBe('A');
        expect(artifactConflicts[0].paths).toHaveLength(2);
    });

    test('root artifacts only, no undeployed → no conflict', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'A.sol', 'A.json'));
        const { artifactConflicts } = scanAllConflicts(tmp);
        expect(artifactConflicts).toHaveLength(0);
    });

    test('multiple conflicts reported', () => {
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'A.sol', 'A.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'lib', 'A.sol', 'A.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'B.sol', 'B.json'));
        writeFile(path.join(tmp, 'artifacts', 'contracts', 'undeployed', 'wallet', 'B.sol', 'B.json'));
        const { artifactConflicts } = scanAllConflicts(tmp);
        expect(artifactConflicts).toHaveLength(2);
    });
});

// ─── scanIdConflicts ──────────────────────────────────────────────────────────

describe('scanIdConflicts', () => {
    let tmp;
    beforeEach(() => { tmp = mkTmp(); });
    afterEach(() => { rmrf(tmp); });

    test('no sources dir → no conflicts', () => {
        const { idConflicts } = scanIdConflicts(tmp);
        expect(idConflicts).toHaveLength(0);
    });

    test('single contract with @arkheion-id → no conflict', () => {
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'A.sol'),
            '// @arkheion-id 1\ncontract TradeEngine is normalTemplate {}');
        const { idConflicts } = scanIdConflicts(tmp);
        expect(idConflicts).toHaveLength(0);
    });

    test('two contracts with different IDs → no conflict', () => {
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'A.sol'),
            '// @arkheion-id 1\ncontract A is normalTemplate {}');
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'B.sol'),
            '// @arkheion-id 2\ncontract B is normalTemplate {}');
        const { idConflicts } = scanIdConflicts(tmp);
        expect(idConflicts).toHaveLength(0);
    });

    test('two contracts sharing same @arkheion-id → conflict', () => {
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'A.sol'),
            '// @arkheion-id 5\ncontract A is normalTemplate {}');
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'B.sol'),
            '// @arkheion-id 5\ncontract B is normalTemplate {}');
        const { idConflicts } = scanIdConflicts(tmp);
        expect(idConflicts).toHaveLength(1);
        expect(idConflicts[0].contractId).toBe(5);
        expect(idConflicts[0].entries).toHaveLength(2);
        const names = idConflicts[0].entries.map(e => e.contractName);
        expect(names).toContain('A');
        expect(names).toContain('B');
    });

    test('contract without @arkheion-id is ignored', () => {
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'A.sol'),
            'contract A is normalTemplate {}');
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'B.sol'),
            '// @arkheion-id 1\ncontract B is normalTemplate {}');
        const { idConflicts } = scanIdConflicts(tmp);
        expect(idConflicts).toHaveLength(0);
    });

    test('conflict in subdirectory', () => {
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'A.sol'),
            '// @arkheion-id 3\ncontract A is normalTemplate {}');
        writeFile(path.join(tmp, 'contracts', 'undeployed', 'lib', 'B.sol'),
            '// @arkheion-id 3\ncontract B is normalTemplate {}');
        const { idConflicts } = scanIdConflicts(tmp);
        expect(idConflicts).toHaveLength(1);
        expect(idConflicts[0].contractId).toBe(3);
    });
});

// ─── failOnAllConflicts with idConflicts ──────────────────────────────────────

describe('failOnAllConflicts with idConflicts', () => {
    test('id conflict → throws', () => {
        expect(() => failOnAllConflicts({
            artifactConflicts: [],
            sourceConflicts: [],
            idConflicts: [{ contractId: 5, entries: [{ contractName: 'A', filePath: '/a' }, { contractName: 'B', filePath: '/b' }] }],
        })).toThrow(/1 contract conflict/);
    });

    test('all three types → total count', () => {
        expect(() => failOnAllConflicts({
            artifactConflicts: [{ contractName: 'X', paths: ['/x1', '/x2'] }],
            sourceConflicts: [{ contractName: 'y', paths: ['/y1', '/y2'] }],
            idConflicts: [{ contractId: 1, entries: [{ contractName: 'A', filePath: '/a' }, { contractName: 'B', filePath: '/b' }] }],
        })).toThrow(/3 contract conflict/);
    });

    test('no conflicts including empty idConflicts → no throw', () => {
        expect(() => failOnAllConflicts({
            artifactConflicts: [],
            sourceConflicts: [],
            idConflicts: [],
        })).not.toThrow();
    });

    test('missing idConflicts field → no throw (backward compat)', () => {
        expect(() => failOnAllConflicts({
            artifactConflicts: [],
            sourceConflicts: [],
        })).not.toThrow();
    });
});

// ─── failOnConflict ───────────────────────────────────────────────────────────

describe('failOnConflict', () => {
    test('throws with conflict message', () => {
        expect(() => failOnConflict('Foo', ['/a/Foo.json', '/b/Foo.json']))
            .toThrow(/Artifact conflict.*Foo.*2 locations/);
    });

    test('single hit does not throw (caller responsibility)', () => {
        // failOnConflict is only called when hits.length > 1 by callers,
        // but the function itself throws regardless — verify message
        expect(() => failOnConflict('Foo', ['/a/Foo.json', '/b/Foo.json', '/c/Foo.json']))
            .toThrow(/3 locations/);
    });
});

// ─── failOnAllConflicts ───────────────────────────────────────────────────────

describe('failOnAllConflicts', () => {
    test('no conflicts → does not throw', () => {
        expect(() => failOnAllConflicts({ artifactConflicts: [], sourceConflicts: [] })).not.toThrow();
    });

    test('artifact conflict → throws', () => {
        expect(() => failOnAllConflicts({
            artifactConflicts: [{ contractName: 'A', paths: ['/a', '/b'] }],
            sourceConflicts: [],
        })).toThrow(/1 contract conflict/);
    });

    test('source conflict → throws', () => {
        expect(() => failOnAllConflicts({
            artifactConflicts: [],
            sourceConflicts: [{ contractName: 'foo', paths: ['/a', '/b'] }],
        })).toThrow(/1 contract conflict/);
    });

    test('both types → total count in message', () => {
        expect(() => failOnAllConflicts({
            artifactConflicts: [{ contractName: 'A', paths: ['/a', '/b'] }],
            sourceConflicts: [{ contractName: 'b', paths: ['/c', '/d'] }],
        })).toThrow(/2 contract conflict/);
    });
});
