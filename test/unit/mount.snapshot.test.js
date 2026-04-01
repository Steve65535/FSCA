/**
 * Unit tests for podSnapshot sync in libs/commands/cluster/mount.js
 *
 * Strategy: mock all chain dependencies, call real mount() function,
 * assert on project.json written to tmp dir.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-mount-test-'));
}

function writeProjectJson(dir, data) {
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2));
}

function readProjectJson(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8'));
}

function baseProject(contracts = []) {
    return {
        network: { name: 'localnet', rpc: 'http://127.0.0.1:8545', chainId: 31337, blockConfirmations: 1 },
        account: { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' },
        arkheion: {
            clusterAddress: '0xCluster',
            multisigAddress: '0xMultisig',
            evokerManagerAddress: '0xEvoker',
            rightManagerAddress: '0xProxy',
            currentOperating: '0xContract',
            alldeployedcontracts: contracts,
            runningcontracts: [],
            unmountedcontracts: contracts.map(c => ({ name: c.name, address: c.address, contractId: null })),
            cleanupPolicy: { defaultMode: 'keep' },
        },
    };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../libs/commands/txExecutor', () => ({
    sendTx: async (fn) => { await fn(); return { blockNumber: 1, hash: '0xTxHash' }; },
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
                    registerContract: async () => { },
                    getAllActiveModules: async () => [],
                    getAllPassiveModules: async () => [],
                };
            }),
            isAddress: () => true,
        },
        Contract: jest.fn().mockImplementation((addr) => {
            const key = addr.toLowerCase();
            if (mockContractInstances.has(key)) return mockContractInstances.get(key);
            return {
                registerContract: async () => { },
                getAllActiveModules: async () => [],
                getAllPassiveModules: async () => [],
            };
        }),
        isAddress: () => true,
        ZeroAddress: actual.ZeroAddress,
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

// mount.js loads ClusterManager ABI from artifacts dir — mock fs lookup by
// providing a minimal ABI file in the tmp dir.
function writeClusterArtifact(dir) {
    const artifactDir = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'ClusterManager.json'), JSON.stringify({
        abi: [
            { type: 'function', name: 'registerContract', inputs: [{ type: 'uint32' }, { type: 'string' }, { type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
        ],
    }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mount podSnapshot sync — real mount.js code path', () => {
    it('rejects mounting a deprecated contract address', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);

        const contractAddr = '0xContract';
        const config = baseProject([
            { name: 'LegacyEngine', address: contractAddr, contractId: 210, generation: 1, deploySeq: 1, status: 'deprecated', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } },
        ]);
        config.arkheion.currentOperating = contractAddr;
        config.arkheion.unmountedcontracts = [{ name: 'LegacyEngine', address: contractAddr, contractId: null }];
        writeProjectJson(dir, config);

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit:${code}`); });
        const mount = require('../../libs/commands/cluster/mount');
        await expect(mount({ rootDir: dir, args: { id: '210', name: 'LegacyEngine' } })).rejects.toThrow('process.exit:1');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('rejects mounting an archived contract address', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);

        const contractAddr = '0xContract';
        const config = baseProject([
            { name: 'ArchivedEngine', address: contractAddr, contractId: 210, generation: 1, deploySeq: 1, status: 'archived', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } },
        ]);
        config.arkheion.currentOperating = contractAddr;
        config.arkheion.unmountedcontracts = [{ name: 'ArchivedEngine', address: contractAddr, contractId: null }];
        writeProjectJson(dir, config);

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit:${code}`); });
        const mount = require('../../libs/commands/cluster/mount');
        await expect(mount({ rootDir: dir, args: { id: '210', name: 'ArchivedEngine' } })).rejects.toThrow('process.exit:1');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('writes non-empty podSnapshot after mount', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);

        const contractAddr = '0xContract';
        writeProjectJson(dir, baseProject([
            { name: 'LendingEngine', address: contractAddr, contractId: null, generation: null, deploySeq: 1, status: 'deployed', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } },
        ]));

        mockContractInstances.set(contractAddr.toLowerCase(), {
            registerContract: async () => { },
            getAllActiveModules: async () => [
                { contractId: 110n, moduleAddress: '0xAccStorage' },
                { contractId: 111n, moduleAddress: '0xPosStorage' },
            ],
            getAllPassiveModules: async () => [
                { contractId: 610n, moduleAddress: '0xMarketReg' },
            ],
        });

        const mount = require('../../libs/commands/cluster/mount');
        await mount({ rootDir: dir, args: { id: '210', name: 'LendingEngine' } });

        const result = readProjectJson(dir);
        const record = result.arkheion.alldeployedcontracts.find(r => r.address === contractAddr);

        expect(record.podSnapshot.active).toEqual([{ contractId: 110 }, { contractId: 111 }]);
        expect(record.podSnapshot.passive).toEqual([{ contractId: 610 }]);
    });

    it('fails when snapshot read throws after mount tx succeeded', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);

        const contractAddr = '0xContract';
        writeProjectJson(dir, baseProject([
            { name: 'FeeEngine', address: contractAddr, contractId: null, generation: null, deploySeq: 1, status: 'deployed', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } },
        ]));

        mockContractInstances.set(contractAddr.toLowerCase(), {
            registerContract: async () => { },
            getAllActiveModules: async () => { throw new Error('RPC timeout'); },
            getAllPassiveModules: async () => [],
        });

        const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit:${code}`); });
        const mount = require('../../libs/commands/cluster/mount');
        await expect(mount({ rootDir: dir, args: { id: '202', name: 'FeeEngine' } })).rejects.toThrow('process.exit:1');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('snapshot with no pods writes empty arrays (not null)', async () => {
        const dir = makeTmpDir();
        writeClusterArtifact(dir);

        const contractAddr = '0xContract';
        writeProjectJson(dir, baseProject([
            { name: 'TokenRegistry', address: contractAddr, contractId: null, generation: null, deploySeq: 1, status: 'deployed', timeStamp: 1000, deployTx: null, podSnapshot: { active: [], passive: [] } },
        ]));

        mockContractInstances.set(contractAddr.toLowerCase(), {
            registerContract: async () => { },
            getAllActiveModules: async () => [],
            getAllPassiveModules: async () => [],
        });

        const mount = require('../../libs/commands/cluster/mount');
        await mount({ rootDir: dir, args: { id: '600', name: 'TokenRegistry' } });

        const result = readProjectJson(dir);
        const record = result.arkheion.alldeployedcontracts.find(r => r.address === contractAddr);
        expect(record.podSnapshot.active).toEqual([]);
        expect(record.podSnapshot.passive).toEqual([]);
    });
});
