/**
 * Unit tests for podSnapshot sync in:
 *   libs/commands/cluster/link.js
 *   libs/commands/cluster/unlink.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-link-test-'));
}

function writeProjectJson(dir, data) {
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2));
}

function readProjectJson(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8'));
}

function baseProject(currentOperating, contracts = []) {
    return {
        network: { name: 'localnet', rpc: 'http://127.0.0.1:8545', chainId: 31337, blockConfirmations: 1 },
        account: { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
        arkheion: {
            clusterAddress: '0xCluster',
            currentOperating,
            alldeployedcontracts: contracts,
            runningcontracts: [],
            unmountedcontracts: [],
        },
    };
}

function writeClusterArtifact(dir) {
    const artifactDir = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'ClusterManager.json'), JSON.stringify({
        abi: [
            { type: 'function', name: 'addActivePodBeforeMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
            { type: 'function', name: 'addPassivePodBeforeMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
            { type: 'function', name: 'addActivePodAfterMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
            { type: 'function', name: 'addPassivePodAfterMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
            { type: 'function', name: 'removeActivePodAfterMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
            { type: 'function', name: 'removePassivePodAfterMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
            { type: 'function', name: 'removeActivePodBeforeMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
            { type: 'function', name: 'removePassivePodBeforeMount', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint32' }], outputs: [], stateMutability: 'nonpayable' },
        ],
    }));
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../libs/commands/txExecutor', () => ({
    sendTx: async (fn) => { await fn(); return { blockNumber: 1, hash: '0xTxHash', logs: [] }; },
}));

jest.mock('../../libs/commands/clusterLock', () => ({
    acquireLock: () => ({ release: () => { } }),
}));

jest.mock('../../chain/provider', () => ({
    getProvider: () => ({}),
}));

jest.mock('../../wallet/signer', () => ({
    getSigner: () => ({}),
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
                    whetherMounted: async () => 0,
                    addActivePodBeforeMount: async () => { },
                    addPassivePodBeforeMount: async () => { },
                    addActivePodAfterMount: async () => { },
                    addPassivePodAfterMount: async () => { },
                    removeActivePodAfterMount: async () => { },
                    removePassivePodAfterMount: async () => { },
                    removeActivePodBeforeMount: async () => { },
                    removePassivePodBeforeMount: async () => { },
                    getAllActiveModules: async () => [],
                    getAllPassiveModules: async () => [],
                };
            }),
            isAddress: () => true,
            Interface: actual.Interface,
        },
        Contract: jest.fn().mockImplementation((addr) => {
            const key = addr.toLowerCase();
            if (mockContractInstances.has(key)) return mockContractInstances.get(key);
            return {
                whetherMounted: async () => 0,
                addActivePodBeforeMount: async () => { },
                addPassivePodBeforeMount: async () => { },
                addActivePodAfterMount: async () => { },
                addPassivePodAfterMount: async () => { },
                removeActivePodAfterMount: async () => { },
                removePassivePodAfterMount: async () => { },
                removeActivePodBeforeMount: async () => { },
                removePassivePodBeforeMount: async () => { },
                getAllActiveModules: async () => [],
                getAllPassiveModules: async () => [],
            };
        }),
        isAddress: () => true,
        ZeroAddress: actual.ZeroAddress,
        Interface: actual.Interface,
    };
});

beforeEach(() => {
    mockContractInstances.clear();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    jest.restoreAllMocks();
});

const CONTRACT_ADDR = '0xLendingEngine';
const TARGET_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // valid checksum addr

// ─── link.js tests ────────────────────────────────────────────────────────────

describe('link podSnapshot sync — real link.js code path', () => {
    it('writes updated podSnapshot after active link (beforeMount)', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);
        writeProjectJson(dir, baseProject(CONTRACT_ADDR, [
            { name: 'LendingEngine', address: CONTRACT_ADDR, contractId: 210, status: 'deployed', podSnapshot: { active: [], passive: [] } },
        ]));

        mockContractInstances.set(CONTRACT_ADDR.toLowerCase(), {
            whetherMounted: async () => 0,
            addActivePodBeforeMount: async () => { },
            getAllActiveModules: async () => [{ contractId: 110n, moduleAddress: '0xAccStorage' }],
            getAllPassiveModules: async () => [],
        });

        const link = require('../../libs/commands/cluster/link');
        await link({ rootDir: dir, args: { type: 'active', targetAddress: TARGET_ADDR, targetId: '110' } });

        const result = readProjectJson(dir);
        const record = result.arkheion.alldeployedcontracts.find(r => r.address === CONTRACT_ADDR);
        expect(record.podSnapshot.active).toEqual([{ contractId: 110 }]);
        expect(record.podSnapshot.passive).toEqual([]);
    });

    it('writes updated podSnapshot after passive link (afterMount)', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);
        writeProjectJson(dir, baseProject(CONTRACT_ADDR, [
            { name: 'LendingEngine', address: CONTRACT_ADDR, contractId: 210, status: 'mounted', podSnapshot: { active: [], passive: [] } },
        ]));

        mockContractInstances.set(CONTRACT_ADDR.toLowerCase(), {
            whetherMounted: async () => 1,
            addPassivePodAfterMount: async () => { },
            getAllActiveModules: async () => [],
            getAllPassiveModules: async () => [{ contractId: 610n, moduleAddress: '0xMarketReg' }],
        });

        const link = require('../../libs/commands/cluster/link');
        await link({ rootDir: dir, args: { type: 'passive', targetAddress: TARGET_ADDR, targetId: '610' } });

        const result = readProjectJson(dir);
        const record = result.arkheion.alldeployedcontracts.find(r => r.address === CONTRACT_ADDR);
        expect(record.podSnapshot.passive).toEqual([{ contractId: 610 }]);
    });

    it('fails when snapshot read throws after link tx succeeded', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);
        writeProjectJson(dir, baseProject(CONTRACT_ADDR, [
            { name: 'LendingEngine', address: CONTRACT_ADDR, contractId: 210, status: 'deployed', podSnapshot: { active: [], passive: [] } },
        ]));

        mockContractInstances.set(CONTRACT_ADDR.toLowerCase(), {
            whetherMounted: async () => 0,
            addActivePodBeforeMount: async () => { },
            getAllActiveModules: async () => { throw new Error('RPC timeout'); },
            getAllPassiveModules: async () => [],
        });

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit:${code}`); });
        const link = require('../../libs/commands/cluster/link');
        await expect(link({ rootDir: dir, args: { type: 'active', targetAddress: TARGET_ADDR, targetId: '110' } })).rejects.toThrow('process.exit:1');

        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

// ─── unlink.js tests ──────────────────────────────────────────────────────────

describe('unlink podSnapshot sync — real unlink.js code path', () => {
    it('routes to beforeMount unlink path when contract is not mounted', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);
        const config = baseProject(CONTRACT_ADDR, [
            { name: 'LendingEngine', address: CONTRACT_ADDR, contractId: 210, status: 'deployed', podSnapshot: { active: [{ contractId: 110 }], passive: [] } },
        ]);
        writeProjectJson(dir, config);

        const removeActivePodBeforeMount = jest.fn(async () => { });
        const removeActivePodAfterMount = jest.fn(async () => { });
        mockContractInstances.set(CONTRACT_ADDR.toLowerCase(), {
            whetherMounted: async () => 0,
            getAllActiveModules: async () => [],
            getAllPassiveModules: async () => [],
        });
        mockContractInstances.set(config.arkheion.clusterAddress.toLowerCase(), {
            removeActivePodBeforeMount,
            removeActivePodAfterMount,
        });

        const unlink = require('../../libs/commands/cluster/unlink');
        await unlink({ rootDir: dir, args: { type: 'active', targetAddress: TARGET_ADDR, targetId: '110' } });

        expect(removeActivePodBeforeMount).toHaveBeenCalled();
        expect(removeActivePodAfterMount).not.toHaveBeenCalled();
    });

    it('writes updated podSnapshot after active unlink', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);
        writeProjectJson(dir, baseProject(CONTRACT_ADDR, [
            { name: 'LendingEngine', address: CONTRACT_ADDR, contractId: 210, status: 'mounted', podSnapshot: { active: [{ contractId: 110 }, { contractId: 111 }], passive: [] } },
        ]));

        mockContractInstances.set(CONTRACT_ADDR.toLowerCase(), {
            whetherMounted: async () => 1,
            removeActivePodAfterMount: async () => { },
            // after unlink, 111 is gone
            getAllActiveModules: async () => [{ contractId: 111n, moduleAddress: '0xPosStorage' }],
            getAllPassiveModules: async () => [],
        });

        const unlink = require('../../libs/commands/cluster/unlink');
        await unlink({ rootDir: dir, args: { type: 'active', targetAddress: TARGET_ADDR, targetId: '110' } });

        const result = readProjectJson(dir);
        const record = result.arkheion.alldeployedcontracts.find(r => r.address === CONTRACT_ADDR);
        expect(record.podSnapshot.active).toEqual([{ contractId: 111 }]);
    });

    it('fails when snapshot read throws after unlink tx succeeded', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);
        writeProjectJson(dir, baseProject(CONTRACT_ADDR, [
            { name: 'LendingEngine', address: CONTRACT_ADDR, contractId: 210, status: 'mounted', podSnapshot: { active: [{ contractId: 110 }], passive: [] } },
        ]));

        mockContractInstances.set(CONTRACT_ADDR.toLowerCase(), {
            whetherMounted: async () => 1,
            removeActivePodAfterMount: async () => { },
            getAllActiveModules: async () => { throw new Error('RPC timeout'); },
            getAllPassiveModules: async () => [],
        });

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit:${code}`); });
        const unlink = require('../../libs/commands/cluster/unlink');
        await expect(unlink({ rootDir: dir, args: { type: 'active', targetAddress: TARGET_ADDR, targetId: '110' } })).rejects.toThrow('process.exit:1');

        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
