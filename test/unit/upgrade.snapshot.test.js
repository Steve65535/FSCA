/**
 * Unit tests for podSnapshot sync in libs/commands/cluster/upgrade.js
 *
 * Covers:
 * 1. Old contract deprecated record gets snapshot from chain (existing behavior)
 * 2. New contract mounted record gets snapshot from chain (new behavior)
 * 3. Snapshot read failure for new contract fails upgrade
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'fsca-upgrade-test-'));
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
        fsca: {
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

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('child_process', () => ({ execSync: jest.fn() }));

jest.mock('../../libs/commands/txExecutor', () => ({
    sendTx: async (fn) => { await fn(); return { blockNumber: 1, hash: '0xTxHash' }; },
}));

jest.mock('../../libs/commands/clusterLock', () => ({
    acquireLock: () => ({ release: () => {} }),
}));

jest.mock('../../libs/commands/confirm', () => ({
    confirm: async () => true,
}));

jest.mock('../../libs/commands/cleanup', () => ({
    resolveCleanupMode: () => 'keep',
    performCleanup: () => ({ actions: [], errors: [] }),
    findSourceFile: () => null,
    findArtifactFile: () => null,
}));

jest.mock('../../libs/commands/contractConflicts', () => ({
    scanContractConflicts: () => ({ hits: [], conflict: false }),
    scanAllConflicts: () => ({ nameConflicts: [], artifactConflicts: [] }),
    scanIdConflicts: () => ({ idConflicts: [] }),
    failOnConflict: () => {},
    failOnAllConflicts: () => {},
}));

jest.mock('../../libs/commands/cluster/auto/analyze', () => jest.fn(() => ({
    errors: [], warnings: [], funcCycles: [],
})));

jest.mock('../../chain/provider', () => ({
    getProvider: () => ({}),
}));

jest.mock('../../wallet/signer', () => ({
    getSigner: () => ({}),
}));

jest.mock('../../chain/deploy', () => ({
    deployContract: jest.fn(async () => '0xNewContract'),
}));

jest.mock('../../wallet/credentials', () => ({
    resolveRpcUrl: (config) => config.network.rpc,
    resolvePrivateKey: (config) => config.account.privateKey,
}));

const mockContractInstances = new Map();

jest.mock('ethers', () => {
    const actual = jest.requireActual('ethers');
    return {
        ...actual,
        ethers: {
            ...actual.ethers,
            Contract: jest.fn().mockImplementation((addr) => {
                const key = addr.toLowerCase();
                if (mockContractInstances.has(key)) return mockContractInstances.get(key);
                return {
                    getById: async () => ({ contractId: 1, name: 'LendingEngine', contractAddr: '0xOldContract' }),
                    deleteContract: async () => {},
                    registerContract: async () => {},
                    addActivePodBeforeMount: async () => {},
                    addPassivePodBeforeMount: async () => {},
                    getAllActiveModules: async () => [],
                    getAllPassiveModules: async () => [],
                };
            }),
        },
        Contract: jest.fn().mockImplementation((addr) => {
            const key = addr.toLowerCase();
            if (mockContractInstances.has(key)) return mockContractInstances.get(key);
            return {
                getById: async () => ({ contractId: 1, name: 'LendingEngine', contractAddr: '0xOldContract' }),
                deleteContract: async () => {},
                registerContract: async () => {},
                addActivePodBeforeMount: async () => {},
                addPassivePodBeforeMount: async () => {},
                getAllActiveModules: async () => [],
                getAllPassiveModules: async () => [],
            };
        }),
        ZeroAddress: actual.ZeroAddress,
        Interface: actual.Interface,
    };
});

// upgrade.js uses loadArtifact from auto/utils
jest.mock('../../libs/commands/cluster/auto/utils', () => ({
    loadArtifact: () => ({
        abi: [{ type: 'constructor', inputs: [{ name: '_clusterAddress', type: 'address' }] }],
        bytecode: '0x600',
    }),
}));

beforeEach(() => {
    mockContractInstances.clear();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

const OLD_ADDR = '0xOldContract';
const NEW_ADDR = '0xNewContract';

function setupMocks({ oldPods = { active: [], passive: [] }, newPods = { active: [], passive: [] } } = {}) {
    // cluster contract
    mockContractInstances.set('0xcluster', {
        getById: async () => ({ contractId: 210, name: 'LendingEngine', contractAddr: OLD_ADDR }),
        deleteContract: async () => {},
        registerContract: async () => {},
        addActivePodBeforeMount: async () => {},
        addPassivePodBeforeMount: async () => {},
        getAllActiveModules: async () => [],
        getAllPassiveModules: async () => [],
    });
    // old contract (read pods before upgrade)
    mockContractInstances.set(OLD_ADDR.toLowerCase(), {
        getAllActiveModules: async () => oldPods.active,
        getAllPassiveModules: async () => oldPods.passive,
    });
    // new contract (read pods after upgrade)
    mockContractInstances.set(NEW_ADDR.toLowerCase(), {
        getAllActiveModules: async () => newPods.active,
        getAllPassiveModules: async () => newPods.passive,
    });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('upgrade podSnapshot sync — real upgrade.js code path', () => {
    it('old contract deprecated record gets snapshot from chain', async () => {
        const dir = makeTmpDir();
        writeProjectJson(dir, baseProject(
            [{ name: 'LendingEngine', address: OLD_ADDR, contractId: 210, generation: 1, deploySeq: 1, status: 'mounted', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } }],
            [{ name: 'LendingEngine', address: OLD_ADDR, contractId: 210, timeStamp: 1000 }],
        ));

        setupMocks({
            oldPods: {
                active: [{ contractId: 110n, moduleAddress: '0xAccStorage' }, { contractId: 111n, moduleAddress: '0xPosStorage' }],
                passive: [{ contractId: 610n, moduleAddress: '0xMarketReg' }],
            },
            newPods: { active: [], passive: [] },
        });

        const upgrade = require('../../libs/commands/cluster/upgrade');
        await upgrade({ rootDir: dir, args: { id: '210', contract: 'LendingEngineV2', yes: true } });

        const result = readProjectJson(dir);
        const deprecated = result.fsca.alldeployedcontracts.find(r => r.address === OLD_ADDR);

        expect(deprecated.status).toBe('deprecated');
        expect(deprecated.podSnapshot.active).toEqual([{ contractId: 110 }, { contractId: 111 }]);
        expect(deprecated.podSnapshot.passive).toEqual([{ contractId: 610 }]);
    });

    it('new contract mounted record gets snapshot from chain', async () => {
        const dir = makeTmpDir();
        writeProjectJson(dir, baseProject(
            [{ name: 'LendingEngine', address: OLD_ADDR, contractId: 210, generation: 1, deploySeq: 1, status: 'mounted', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } }],
            [{ name: 'LendingEngine', address: OLD_ADDR, contractId: 210, timeStamp: 1000 }],
        ));

        setupMocks({
            oldPods: { active: [], passive: [] },
            newPods: {
                active: [{ contractId: 110n, moduleAddress: '0xAccStorage' }, { contractId: 111n, moduleAddress: '0xPosStorage' }],
                passive: [{ contractId: 610n, moduleAddress: '0xMarketReg' }],
            },
        });

        const upgrade = require('../../libs/commands/cluster/upgrade');
        await upgrade({ rootDir: dir, args: { id: '210', contract: 'LendingEngineV2', yes: true } });

        const result = readProjectJson(dir);
        const mounted = result.fsca.alldeployedcontracts.find(r => r.address === NEW_ADDR);

        expect(mounted.status).toBe('mounted');
        expect(mounted.podSnapshot.active).toEqual([{ contractId: 110 }, { contractId: 111 }]);
        expect(mounted.podSnapshot.passive).toEqual([{ contractId: 610 }]);
    });

    it('snapshot read failure for new contract fails upgrade after chain state changed', async () => {
        const dir = makeTmpDir();
        writeProjectJson(dir, baseProject(
            [{ name: 'LendingEngine', address: OLD_ADDR, contractId: 210, generation: 1, deploySeq: 1, status: 'mounted', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } }],
            [{ name: 'LendingEngine', address: OLD_ADDR, contractId: 210, timeStamp: 1000 }],
        ));

        mockContractInstances.set('0xcluster', {
            getById: async () => ({ contractId: 210, name: 'LendingEngine', contractAddr: OLD_ADDR }),
            deleteContract: async () => {},
            registerContract: async () => {},
            addActivePodBeforeMount: async () => {},
            addPassivePodBeforeMount: async () => {},
        });
        mockContractInstances.set(OLD_ADDR.toLowerCase(), {
            getAllActiveModules: async () => [],
            getAllPassiveModules: async () => [],
        });
        mockContractInstances.set(NEW_ADDR.toLowerCase(), {
            getAllActiveModules: async () => { throw new Error('RPC timeout'); },
            getAllPassiveModules: async () => [],
        });

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit:${code}`); });

        const upgrade = require('../../libs/commands/cluster/upgrade');
        await expect(upgrade({ rootDir: dir, args: { id: '210', contract: 'LendingEngineV2', yes: true } })).rejects.toThrow('process.exit:1');

        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
