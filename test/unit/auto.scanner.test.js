/**
 * Unit tests for libs/commands/cluster/auto/scanner.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const scan = require('../../libs/commands/cluster/auto/scanner');

function makeTmpProject(files) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-test-'));
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

const NORMAL_TEMPLATE_CONTRACT = (name) => `
// @arkheion-auto yes
// @arkheion-id 1
contract ${name} is normalTemplate {
    function foo() external {}
}
`;

describe('scanner', () => {
    describe('basic scanning', () => {
        it('finds a normalTemplate contract in undeployed/', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/MyContract.sol': NORMAL_TEMPLATE_CONTRACT('MyContract'),
            });
            try {
                const { contracts } = scan(dir);
                expect(contracts.some(c => c.contractName === 'MyContract')).toBe(true);
            } finally { cleanup(dir); }
        });

        it('returns filePath and sourceCode for each contract', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/MyContract.sol': NORMAL_TEMPLATE_CONTRACT('MyContract'),
            });
            try {
                const { contracts } = scan(dir);
                expect(contracts[0].filePath).toBeTruthy();
                expect(contracts[0].sourceCode).toContain('normalTemplate');
            } finally { cleanup(dir); }
        });

        it('ignores .sol files that do not inherit normalTemplate', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/Plain.sol': `contract Plain { function foo() external {} }`,
            });
            try {
                const { contracts } = scan(dir);
                expect(contracts).toHaveLength(0);
            } finally { cleanup(dir); }
        });

        it('returns empty when no contracts/ directory exists', () => {
            const dir = makeTmpProject({});
            try {
                const { contracts } = scan(dir);
                expect(contracts).toHaveLength(0);
            } finally { cleanup(dir); }
        });
    });

    describe('core file exclusion', () => {
        it('excludes normaltemplate.sol', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/lib/normaltemplate.sol': `contract normalTemplate {}`,
            });
            try {
                const { contracts } = scan(dir);
                expect(contracts).toHaveLength(0);
            } finally { cleanup(dir); }
        });

        it('excludes clustermanager.sol', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/structure/clustermanager.sol': `contract ClusterManager is normalTemplate {}`,
            });
            try {
                const { contracts } = scan(dir);
                expect(contracts).toHaveLength(0);
            } finally { cleanup(dir); }
        });

        it('excludes multisigwallet.sol', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/wallet/multisigwallet.sol': `contract MultiSigWallet is normalTemplate {}`,
            });
            try {
                const { contracts } = scan(dir);
                expect(contracts).toHaveLength(0);
            } finally { cleanup(dir); }
        });
    });

    describe('deduplication', () => {
        it('prefers undeployed over deployed when same contract name exists in both', () => {
            const undeployedSrc = NORMAL_TEMPLATE_CONTRACT('MyContract') + '// undeployed version';
            const deployedSrc = NORMAL_TEMPLATE_CONTRACT('MyContract') + '// deployed version';
            const dir = makeTmpProject({
                'contracts/undeployed/MyContract.sol': undeployedSrc,
                'contracts/deployed/MyContract.sol': deployedSrc,
            });
            try {
                const { contracts, warnings } = scan(dir);
                const found = contracts.filter(c => c.contractName === 'MyContract');
                expect(found).toHaveLength(1);
                expect(found[0].sourceCode).toContain('undeployed version');
                expect(warnings.some(w => w.includes('MyContract'))).toBe(true);
            } finally { cleanup(dir); }
        });

        it('emits a warning for the skipped duplicate', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/Dup.sol': NORMAL_TEMPLATE_CONTRACT('Dup'),
                'contracts/deployed/Dup.sol': NORMAL_TEMPLATE_CONTRACT('Dup'),
            });
            try {
                const { warnings } = scan(dir);
                expect(warnings.length).toBeGreaterThan(0);
            } finally { cleanup(dir); }
        });
    });

    describe('multiple contracts', () => {
        it('finds multiple contracts across subdirectories', () => {
            const dir = makeTmpProject({
                'contracts/undeployed/A.sol': NORMAL_TEMPLATE_CONTRACT('ContractA'),
                'contracts/undeployed/sub/B.sol': NORMAL_TEMPLATE_CONTRACT('ContractB'),
            });
            try {
                const { contracts } = scan(dir);
                const names = contracts.map(c => c.contractName);
                expect(names).toContain('ContractA');
                expect(names).toContain('ContractB');
            } finally { cleanup(dir); }
        });
    });
});
