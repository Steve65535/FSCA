/**
 * Unit tests for podSnapshot sync in libs/commands/cluster/auto.js
 *
 * Strategy: mock all chain/fs/compile dependencies so auto() can run to
 * completion in-process. The snapshot sync block in auto.js calls
 * ethers.Contract(addr, NORMAL_TEMPLATE_ALL_ABI, provider) — we intercept
 * that via a jest.mock on ethers to return controlled pod data.
 *
 * We do NOT copy the sync logic here — we call the real auto() function and
 * assert on the project.json written to a tmp dir.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-snap-test-'));
}

function writeProjectJson(dir, data) {
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2));
}

function readProjectJson(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8'));
}

function baseProject(contracts = [], running = []) {
    return {
        network: { name: 'localnet', rpc: 'http://127.0.0.1:8545', chainId: 31337, blockConfirmations: 1 },
        account: { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
        arkheion: {
            clusterAddress: '0xCluster',
            multisigAddress: '0xMultisig',
            evokerManagerAddress: '0xEvoker',
            rightManagerAddress: '0xProxy',
            currentOperating: '',
            alldeployedcontracts: contracts,
            runningcontracts: running,
            unmountedcontracts: [],
            cleanupPolicy: { defaultMode: 'keep' },
        },
    };
}

// ─── Mock setup ───────────────────────────────────────────────────────────────
//
// auto.js imports: ethers, chain/provider, wallet/signer, chain/deploy,
// auto/analyze, auto/reconciler, auto/utils, cleanup, confirm, version,
// txExecutor, clusterLock, contractConflicts
//
// We mock everything that touches the network or filesystem outside rootDir.

jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

jest.mock('../../chain/provider', () => ({
    getProvider: () => ({ getCode: async () => '0x1234' }),
}));

jest.mock('../../wallet/signer', () => ({
    getSigner: () => ({}),
}));

jest.mock('../../chain/deploy', () => ({
    deployContract: jest.fn(),
}));

jest.mock('../../libs/commands/confirm', () => ({
    confirm: async () => true,
}));

jest.mock('../../libs/commands/txExecutor', () => ({
    sendTx: async (fn) => fn(),
}));

jest.mock('../../libs/commands/clusterLock', () => ({
    acquireLock: () => ({ release: () => { } }),
}));

jest.mock('../../libs/commands/contractConflicts', () => ({
    scanAllConflicts: () => ({ nameConflicts: [], artifactConflicts: [] }),
    scanIdConflicts: () => ({ idConflicts: [] }),
    failOnAllConflicts: () => { },
}));

jest.mock('../../libs/commands/cleanup', () => ({
    resolveCleanupMode: () => 'keep',
    performCleanup: () => ({ actions: [], errors: [] }),
    findSourceFile: () => null,
    findArtifactFile: () => null,
}));

// ethers mock: Contract constructor returns different pod data per address
const mockContractInstances = new Map();
jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    return {
        ...actual,
        ethers: {
            ...actual.ethers,
            Contract: jest.fn().mockImplementation((addr) => {
                const key = addr.toLowerCase();
                if (mockContractInstances.has(key)) {
                    return mockContractInstances.get(key);
                }
                // Default: cluster contract (write ops are no-ops)
                return {
                    addActivePodBeforeMount: async () => { },
                    addPassivePodBeforeMount: async () => { },
                    addActivePodAfterMount: async () => { },
                    addPassivePodAfterMount: async () => { },
                    registerContract: async () => { },
                    getById: async (id) => ({ contractId: id, name: '', contractAddr: actual.ethers.ZeroAddress }),
                    getActiveModuleAddress: async () => actual.ethers.ZeroAddress,
                    getPassiveModuleAddress: async () => actual.ethers.ZeroAddress,
                    getAllActiveModules: async () => [],
                    getAllPassiveModules: async () => [],
                };
            }),
        },
        Contract: jest.fn().mockImplementation((addr) => {
            const key = addr.toLowerCase();
            if (mockContractInstances.has(key)) {
                return mockContractInstances.get(key);
            }
            return {
                addActivePodBeforeMount: async () => { },
                addPassivePodBeforeMount: async () => { },
                addActivePodAfterMount: async () => { },
                addPassivePodAfterMount: async () => { },
                registerContract: async () => { },
                getById: async (id) => ({ contractId: id, name: '', contractAddr: actual.ethers.ZeroAddress }),
                getActiveModuleAddress: async () => actual.ethers.ZeroAddress,
                getPassiveModuleAddress: async () => actual.ethers.ZeroAddress,
                getAllActiveModules: async () => [],
                getAllPassiveModules: async () => [],
            };
        }),
        ZeroAddress: actual.ZeroAddress,
        Interface: actual.Interface,
    };
});

// analyze mock — returns a minimal valid analysis result
jest.mock('../../libs/commands/cluster/auto/analyze', () => jest.fn());

// reconciler mock
jest.mock('../../libs/commands/cluster/auto/reconciler', () => jest.fn());

// utils mock — loadArtifact returns a minimal artifact
jest.mock('../../libs/commands/cluster/auto/utils', () => ({
    loadProjectConfig: (rootDir) => {
        const fs = require('fs');
        const path = require('path');
        return JSON.parse(fs.readFileSync(path.join(rootDir, 'project.json'), 'utf-8'));
    },
    saveProjectConfig: (rootDir, config) => {
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(rootDir, 'project.json'), JSON.stringify(config, null, 2));
    },
    loadArtifact: () => ({
        abi: [{ type: 'constructor', inputs: [{ name: '_clusterAddress', type: 'address' }] }],
        bytecode: '0x600',
    }),
}));

const analyze = require('../../libs/commands/cluster/auto/analyze');
const reconcile = require('../../libs/commands/cluster/auto/reconciler');

// ─── Test factory ─────────────────────────────────────────────────────────────

function setupAnalyze({ contractName, arkheionId, activePods = [], passivePods = [] }) {
    analyze.mockReturnValue({
        parsed: [{ arkheionId, contractName, filePath: '/fake/path.sol', activePods, passivePods }],
        idToName: new Map([[arkheionId, contractName]]),
        idToContract: new Map([[arkheionId, { arkheionId, contractName, filePath: '/fake/path.sol', activePods, passivePods }]]),
        sorted: [arkheionId],
        cycleEdges: [],
        podCycles: [],
        funcCycles: [],
        funcCycleEdgeSet: new Set(),
        warnings: [],
        errors: [],
    });
}

function setupReconcile(arkheionId, contractName, deployedAddr = null) {
    const state = deployedAddr ? 'unmounted' : 'undeployed';
    const actions = deployedAddr ? ['link', 'mount'] : ['deploy', 'link', 'mount'];
    reconcile.mockReturnValue({
        plan: [{
            arkheionId,
            contractName,
            state,
            actions,
            existingAddress: deployedAddr,
            activePods: [],
            passivePods: [],
        }],
        warnings: [],
    });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockContractInstances.clear();
    jest.clearAllMocks();
    // suppress console output in tests
    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('auto podSnapshot sync — real auto.js code path', () => {
    it('dry-run prints plan and does not mutate project.json or write checkpoint/report', async () => {
        const dir = makeTmpDir();
        const original = baseProject([
            { name: 'LendingEngine', address: '0xLending', contractId: null, generation: null, deploySeq: 1, status: 'deployed', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } },
        ]);
        writeProjectJson(dir, original);

        setupAnalyze({ contractName: 'LendingEngine', arkheionId: 210 });
        setupReconcile(210, 'LendingEngine', '0xLending');

        const before = fs.readFileSync(path.join(dir, 'project.json'), 'utf-8');
        const auto = require('../../libs/commands/cluster/auto');
        await auto({ rootDir: dir, args: { 'dry-run': true } });
        const after = fs.readFileSync(path.join(dir, 'project.json'), 'utf-8');

        expect(after).toBe(before);
        expect(fs.existsSync(path.join(dir, 'auto-checkpoint.json'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'auto-report.json'))).toBe(false);
    });

    it('writes non-empty podSnapshot to project.json after mount', async () => {
        const dir = makeTmpDir();
        const contractAddr = '0xLending';

        // pre-existing deployed record (unmounted)
        writeProjectJson(dir, baseProject(
            [{ name: 'LendingEngine', address: contractAddr, contractId: null, generation: null, deploySeq: 1, status: 'deployed', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } }],
        ));

        setupAnalyze({ contractName: 'LendingEngine', arkheionId: 210 });
        setupReconcile(210, 'LendingEngine', contractAddr);

        // chain returns real pods for this address
        mockContractInstances.set(contractAddr.toLowerCase(), {
            addActivePodBeforeMount: async () => { },
            addPassivePodBeforeMount: async () => { },
            addActivePodAfterMount: async () => { },
            addPassivePodAfterMount: async () => { },
            registerContract: async () => { },
            getById: async () => ({ contractId: 0, name: '', contractAddr: require('ethers').ZeroAddress }),
            getActiveModuleAddress: async () => require('ethers').ZeroAddress,
            getPassiveModuleAddress: async () => require('ethers').ZeroAddress,
            getAllActiveModules: async () => [
                { contractId: 110n, moduleAddress: '0xAccStorage' },
                { contractId: 111n, moduleAddress: '0xPosStorage' },
            ],
            getAllPassiveModules: async () => [
                { contractId: 610n, moduleAddress: '0xMarketReg' },
            ],
        });

        // also mock cluster contract
        mockContractInstances.set('0xcluster', {
            addActivePodBeforeMount: async () => { },
            addPassivePodBeforeMount: async () => { },
            addActivePodAfterMount: async () => { },
            addPassivePodAfterMount: async () => { },
            registerContract: async () => { },
            getById: async () => ({ contractId: 0, name: '', contractAddr: require('ethers').ZeroAddress }),
            getActiveModuleAddress: async () => require('ethers').ZeroAddress,
            getPassiveModuleAddress: async () => require('ethers').ZeroAddress,
        });

        const auto = require('../../libs/commands/cluster/auto');
        await auto({ rootDir: dir, args: { yes: true } });

        const result = readProjectJson(dir);
        const record = result.arkheion.alldeployedcontracts.find(r => r.address === contractAddr);

        expect(record).toBeDefined();
        expect(record.podSnapshot.active).toEqual([{ contractId: 110 }, { contractId: 111 }]);
        expect(record.podSnapshot.passive).toEqual([{ contractId: 610 }]);
    });

    it('exits with error when getAllActiveModules throws', async () => {
        const dir = makeTmpDir();
        const contractAddr = '0xBroken';

        writeProjectJson(dir, baseProject(
            [{ name: 'BrokenContract', address: contractAddr, contractId: null, generation: null, deploySeq: 1, status: 'deployed', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } }],
        ));

        setupAnalyze({ contractName: 'BrokenContract', arkheionId: 999 });
        setupReconcile(999, 'BrokenContract', contractAddr);

        mockContractInstances.set(contractAddr.toLowerCase(), {
            addActivePodBeforeMount: async () => { },
            addPassivePodBeforeMount: async () => { },
            registerContract: async () => { },
            getById: async () => ({ contractId: 0, name: '', contractAddr: require('ethers').ZeroAddress }),
            getActiveModuleAddress: async () => require('ethers').ZeroAddress,
            getPassiveModuleAddress: async () => require('ethers').ZeroAddress,
            getAllActiveModules: async () => { throw new Error('RPC timeout'); },
            getAllPassiveModules: async () => [],
        });

        mockContractInstances.set('0xcluster', {
            addActivePodBeforeMount: async () => { },
            addPassivePodBeforeMount: async () => { },
            addActivePodAfterMount: async () => { },
            addPassivePodAfterMount: async () => { },
            registerContract: async () => { },
            getById: async () => ({ contractId: 0, name: '', contractAddr: require('ethers').ZeroAddress }),
            getActiveModuleAddress: async () => require('ethers').ZeroAddress,
            getPassiveModuleAddress: async () => require('ethers').ZeroAddress,
        });

        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit:1'); });

        const auto = require('../../libs/commands/cluster/auto');
        await expect(auto({ rootDir: dir, args: { yes: true } })).rejects.toThrow('process.exit:1');

        expect(mockExit).toHaveBeenCalledWith(1);

        // auto-report.json must be written with the error
        const reportPath = path.join(dir, 'auto-report.json');
        expect(fs.existsSync(reportPath)).toBe(true);
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        expect(report.errors.some(e => e.includes('podSnapshot sync failed'))).toBe(true);
        expect(report.errors.some(e => e.includes('BrokenContract'))).toBe(true);

        mockExit.mockRestore();
    });

    it('does not affect deprecated records with same contractId', async () => {
        const dir = makeTmpDir();
        const oldAddr = '0xOld';
        const newAddr = '0xNew';

        writeProjectJson(dir, baseProject(
            [
                { name: 'TradeEngine', address: oldAddr, contractId: 1, generation: 1, deploySeq: 1, status: 'deprecated', timeStamp: 1000, deployTx: null, podSnapshot: { active: [{ contractId: 99 }], passive: [] } },
                { name: 'TradeEngine', address: newAddr, contractId: null, generation: null, deploySeq: 2, status: 'deployed', timeStamp: 1001, deployTx: null, podSnapshot: { active: [], passive: [] } },
            ],
        ));

        setupAnalyze({ contractName: 'TradeEngine', arkheionId: 1 });
        setupReconcile(1, 'TradeEngine', newAddr);

        mockContractInstances.set(newAddr.toLowerCase(), {
            addActivePodBeforeMount: async () => { },
            addPassivePodBeforeMount: async () => { },
            registerContract: async () => { },
            getById: async () => ({ contractId: 0, name: '', contractAddr: require('ethers').ZeroAddress }),
            getActiveModuleAddress: async () => require('ethers').ZeroAddress,
            getPassiveModuleAddress: async () => require('ethers').ZeroAddress,
            getAllActiveModules: async () => [{ contractId: 2n, moduleAddress: '0xDep' }],
            getAllPassiveModules: async () => [],
        });

        mockContractInstances.set('0xcluster', {
            addActivePodBeforeMount: async () => { },
            addPassivePodBeforeMount: async () => { },
            addActivePodAfterMount: async () => { },
            addPassivePodAfterMount: async () => { },
            registerContract: async () => { },
            getById: async () => ({ contractId: 0, name: '', contractAddr: require('ethers').ZeroAddress }),
            getActiveModuleAddress: async () => require('ethers').ZeroAddress,
            getPassiveModuleAddress: async () => require('ethers').ZeroAddress,
        });

        const auto = require('../../libs/commands/cluster/auto');
        await auto({ rootDir: dir, args: { yes: true } });

        const result = readProjectJson(dir);
        const deprecated = result.arkheion.alldeployedcontracts.find(r => r.address === oldAddr);
        const mounted = result.arkheion.alldeployedcontracts.find(r => r.address === newAddr);

        // deprecated record must be untouched
        expect(deprecated.podSnapshot.active).toEqual([{ contractId: 99 }]);
        // mounted record gets real pods
        expect(mounted.podSnapshot.active).toEqual([{ contractId: 2 }]);
    });
});

describe('rollback reads podSnapshot written by auto — integration', () => {
    it('podSnapshot written by auto is non-empty and passes rollback isEmpty check', async () => {
        const { normalizeRecord, findPreviousGeneration } = require('../../libs/commands/version');

        // Simulate what auto writes after snapshot sync
        const allDeployed = [
            {
                name: 'LendingEngine', address: '0xGen1', contractId: 210,
                generation: 1, status: 'deprecated', timeStamp: 1000,
                podSnapshot: {
                    active: [{ contractId: 110 }, { contractId: 111 }],
                    passive: [{ contractId: 610 }],
                },
            },
            {
                name: 'LendingEngine', address: '0xGen2', contractId: 210,
                generation: 2, status: 'mounted', timeStamp: 2000,
                podSnapshot: { active: [], passive: [] },
            },
        ];

        const target = findPreviousGeneration(allDeployed, 210);
        const normalized = normalizeRecord(target, 'alldeployedcontracts');

        expect(normalized.status).toBe('deprecated');
        expect(normalized.podSnapshot.active).toEqual([{ contractId: 110 }, { contractId: 111 }]);
        expect(normalized.podSnapshot.passive).toEqual([{ contractId: 610 }]);

        // rollback.js isEmpty check — must be false
        const isEmpty = !normalized.podSnapshot?.active?.length && !normalized.podSnapshot?.passive?.length;
        expect(isEmpty).toBe(false);
    });
});
