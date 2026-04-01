const fs = require('fs');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-unmount-test-'));
}

function writeProjectJson(dir, data) {
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function readProjectJson(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8'));
}

function writeClusterArtifact(dir) {
  const artifactDir = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'ClusterManager.json'), JSON.stringify({
    abi: [{ type: 'function', name: 'deleteContract', inputs: [{ type: 'uint32' }], outputs: [] }],
  }), 'utf-8');
}

function baseProject() {
  return {
    network: { rpc: 'http://127.0.0.1:8545' },
    account: { privateKey: '0x' + 'a'.repeat(64) },
    arkheion: {
      clusterAddress: '0x' + '1'.repeat(40),
      currentOperating: '0x' + 'b'.repeat(40),
      runningcontracts: [
        { name: 'SwapEngine', address: '0x' + 'b'.repeat(40), contractId: 200, timeStamp: 1000 },
      ],
      unmountedcontracts: [],
    },
  };
}

const mockSendTx = jest.fn();
const mockAcquireLock = jest.fn();

jest.mock('../../chain/provider', () => ({ getProvider: jest.fn(() => ({})) }));
jest.mock('../../wallet/signer', () => ({ getSigner: jest.fn(() => ({})) }));
jest.mock('../../libs/commands/txExecutor', () => ({ sendTx: (...args) => mockSendTx(...args) }));
jest.mock('../../libs/commands/clusterLock', () => ({ acquireLock: (...args) => mockAcquireLock(...args) }));

const contractStub = {
  deleteContract: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => { });
  jest.spyOn(console, 'warn').mockImplementation(() => { });
  jest.spyOn(console, 'error').mockImplementation(() => { });
  jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit:${code}`);
  });

  mockAcquireLock.mockReturnValue({ release: jest.fn() });
  mockSendTx.mockImplementation(async (fn) => {
    await fn();
    return { hash: '0xTxHash' };
  });
  contractStub.deleteContract.mockResolvedValue({});
  jest.spyOn(ethers, 'Contract').mockImplementation(() => contractStub);
  jest.spyOn(ethers.ethers, 'Contract').mockImplementation(() => contractStub);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('unmount command — real unmount.js path', () => {
  it('moves running contract to unmounted, clears contractId, acquires and releases lock', async () => {
    const dir = makeTmpDir();
    writeClusterArtifact(dir);
    writeProjectJson(dir, baseProject());
    const mockRelease = jest.fn();
    mockAcquireLock.mockReturnValue({ release: mockRelease });

    const unmount = require('../../libs/commands/cluster/unmount');
    await unmount({ rootDir: dir, args: { id: '200' } });

    const updated = readProjectJson(dir);
    expect(updated.arkheion.runningcontracts).toEqual([]);
    expect(updated.arkheion.unmountedcontracts).toEqual([
      expect.objectContaining({
        name: 'SwapEngine',
        address: '0x' + 'b'.repeat(40),
        contractId: null,
        timeStamp: 1000,
      }),
    ]);
    expect(contractStub.deleteContract).toHaveBeenCalledWith('200');
    expect(mockAcquireLock).toHaveBeenCalledWith(dir, expect.any(String), 'cluster unmount');
    expect(mockRelease).toHaveBeenCalled();
  });

  it('keeps cache stable and warns when on-chain unmount succeeds but running cache misses', async () => {
    const dir = makeTmpDir();
    writeClusterArtifact(dir);
    const config = baseProject();
    config.arkheion.runningcontracts = [];
    config.arkheion.unmountedcontracts = [{ name: 'Old', address: '0x' + 'c'.repeat(40), contractId: null }];
    writeProjectJson(dir, config);

    const unmount = require('../../libs/commands/cluster/unmount');
    await unmount({ rootDir: dir, args: { id: '200' } });

    const updated = readProjectJson(dir);
    expect(updated.arkheion.runningcontracts).toEqual([]);
    expect(updated.arkheion.unmountedcontracts).toEqual([{ name: 'Old', address: '0x' + 'c'.repeat(40), contractId: null }]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("not found in local 'runningcontracts' cache."));
  });

  it('syncs alldeployedcontracts status from mounted to deployed', async () => {
    const dir = makeTmpDir();
    writeClusterArtifact(dir);
    const config = baseProject();
    config.arkheion.alldeployedcontracts = [
      { name: 'SwapEngine', address: '0x' + 'b'.repeat(40), contractId: 200, status: 'mounted', generation: 1 },
    ];
    writeProjectJson(dir, config);

    const unmount = require('../../libs/commands/cluster/unmount');
    await unmount({ rootDir: dir, args: { id: '200' } });

    const updated = readProjectJson(dir);
    expect(updated.arkheion.alldeployedcontracts[0].status).toBe('deployed');
  });
});
