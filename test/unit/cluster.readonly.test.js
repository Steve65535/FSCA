const fs = require('fs');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-readonly-test-'));
}

function writeProjectJson(dir, data) {
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function writeClusterArtifact(dir) {
  const artifactDir = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'ClusterManager.json'), JSON.stringify({
    abi: [
      { type: 'function', name: 'getById', inputs: [{ type: 'uint32' }], outputs: [] },
      { type: 'function', name: 'contractRegistrations', inputs: [{ type: 'uint256' }], outputs: [] },
      { type: 'function', name: 'allRegistrations', inputs: [{ type: 'uint256' }], outputs: [] },
    ],
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
        { name: 'SwapEngine', address: '0x' + 'b'.repeat(40), contractId: 200, timeStamp: 2000, deployTx: '0x' + 'c'.repeat(64) },
      ],
      unmountedcontracts: [
        { name: 'FeeEngine', address: '0x' + 'd'.repeat(40), contractId: null, timeStamp: 1000 },
      ],
      alldeployedcontracts: [
        { name: 'SwapEngine', address: '0x' + 'a'.repeat(40), contractId: 200, generation: 1, status: 'deprecated', timeStamp: 1000, deploySeq: 1, podSnapshot: { active: [], passive: [] } },
        { name: 'SwapEngine', address: '0x' + 'b'.repeat(40), contractId: 200, generation: 2, status: 'mounted', timeStamp: 2000, deploySeq: 2, podSnapshot: { active: [], passive: [] } },
      ],
    },
  };
}

const mockGetProvider = jest.fn();
const mockResolveRpcUrl = jest.fn();
const mockContract = {
  getById: jest.fn(),
  contractRegistrations: jest.fn(),
  allRegistrations: jest.fn(),
};

jest.mock('../../chain/provider', () => ({ getProvider: (...args) => mockGetProvider(...args) }));
jest.mock('../../wallet/credentials', () => ({
  resolveRpcUrl: (...args) => mockResolveRpcUrl(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => { });
  jest.spyOn(console, 'warn').mockImplementation(() => { });
  jest.spyOn(console, 'error').mockImplementation(() => { });
  jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit:${code}`);
  });
  jest.spyOn(ethers, 'Contract').mockImplementation(() => mockContract);
  jest.spyOn(ethers.ethers, 'Contract').mockImplementation(() => mockContract);

  mockGetProvider.mockReturnValue({});
  mockResolveRpcUrl.mockReturnValue('http://127.0.0.1:8545');
  mockContract.getById.mockResolvedValue({
    contractId: 200n,
    name: 'SwapEngine',
    contractAddr: '0x' + 'b'.repeat(40),
  });
  mockContract.contractRegistrations.mockImplementation(async (idx) => {
    if (Number(idx) === 0) return [200n, 'SwapEngine', '0x' + 'b'.repeat(40), 2000n];
    throw new Error('out of bounds');
  });
  mockContract.allRegistrations.mockImplementation(async (idx) => {
    if (Number(idx) === 0) return [200n, 'SwapEngine', '0x' + 'b'.repeat(40), 2000n];
    throw new Error('out of bounds');
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cluster readonly commands', () => {
  it('history prints generation chain from project.json', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());

    const history = require('../../libs/commands/cluster/history');
    await history({ rootDir: dir, args: { id: '200' } });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('History for contractId=200'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0x' + 'a'.repeat(40)));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0x' + 'b'.repeat(40)));
  });

  it('current resolves metadata from runningcontracts', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());

    const current = require('../../libs/commands/cluster/current');
    await current({ rootDir: dir, args: {} });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Operating Contract'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('SwapEngine'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✓ MOUNTED'));
  });

  it('info queries cluster registry by id', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());
    writeClusterArtifact(dir);

    const info = require('../../libs/commands/cluster/info');
    await info({ rootDir: dir, args: { id: '200' } });

    expect(mockContract.getById).toHaveBeenCalledWith('200');
    expect(console.log).toHaveBeenCalledWith('Contract Info:');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('SwapEngine'));
  });

  it('list mounted prints formatted registrations without pager fallback when result set is small', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());
    writeClusterArtifact(dir);

    const list = require('../../libs/commands/cluster/list');
    await list({ rootDir: dir, args: {}, subcommands: ['cluster', 'list', 'mounted'] });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Fetching mounted contracts from ClusterManager'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Mounted Contracts (1)'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('SwapEngine'));
  });

  it('list dumps all lines to console.log directly when stdout is not a TTY', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());
    writeClusterArtifact(dir);

    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    try {
      const list = require('../../libs/commands/cluster/list');
      await list({ rootDir: dir, args: {}, subcommands: ['cluster', 'list', 'mounted'] });

      // In non-TTY mode displayWithPager must call console.log with the joined block,
      // never spawning less or the interactive pager.
      const allCalls = console.log.mock.calls.map(c => c[0]);
      const block = allCalls.find(s => typeof s === 'string' && s.includes('SwapEngine'));
      expect(block).toBeDefined();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    }
  });
});
