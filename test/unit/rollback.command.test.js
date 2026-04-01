const fs = require('fs');
const path = require('path');
const os = require('os');
const actualEthers = jest.requireActual('ethers');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-rollback-test-'));
}

function writeProjectJson(dir, data) {
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function readProjectJson(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8'));
}

function readJson(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
}

function baseProject() {
  return {
    network: { name: 'localnet', rpc: 'http://127.0.0.1:8545' },
    account: { privateKey: '0x' + 'a'.repeat(64) },
    arkheion: {
      clusterAddress: '0x' + '1'.repeat(40),
      currentOperating: '0x' + 'c'.repeat(40),
      alldeployedcontracts: [
        {
          name: 'LendingEngine',
          address: '0x' + 'b'.repeat(40),
          contractId: 210,
          generation: 1,
          status: 'deprecated',
          timeStamp: 1000,
          podSnapshot: { active: [{ contractId: 110 }], passive: [{ contractId: 610 }] },
        },
        {
          name: 'LendingEngine',
          address: '0x' + 'c'.repeat(40),
          contractId: 210,
          generation: 2,
          status: 'mounted',
          timeStamp: 2000,
          podSnapshot: { active: [], passive: [] },
        },
      ],
      runningcontracts: [
        { name: 'LendingEngine', address: '0x' + 'c'.repeat(40), contractId: 210, timeStamp: 2000 },
      ],
      unmountedcontracts: [],
    },
  };
}

const mockConfirm = jest.fn();
const mockSendTx = jest.fn();
const mockAcquireLock = jest.fn();
const mockGetProvider = jest.fn();
const mockGetSigner = jest.fn();
const mockResolveRpcUrl = jest.fn();
const mockResolvePrivateKey = jest.fn();
const mockContractInstances = new Map();

jest.mock('../../libs/commands/confirm', () => ({ confirm: (...args) => mockConfirm(...args) }));
jest.mock('../../libs/commands/txExecutor', () => ({ sendTx: (...args) => mockSendTx(...args) }));
jest.mock('../../libs/commands/clusterLock', () => ({ acquireLock: (...args) => mockAcquireLock(...args) }));
jest.mock('../../chain/provider', () => ({ getProvider: (...args) => mockGetProvider(...args) }));
jest.mock('../../wallet/signer', () => ({ getSigner: (...args) => mockGetSigner(...args) }));
jest.mock('../../wallet/credentials', () => ({
  resolveRpcUrl: (...args) => mockResolveRpcUrl(...args),
  resolvePrivateKey: (...args) => mockResolvePrivateKey(...args),
}));

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  const makeContract = (addr) => {
    const key = String(addr).toLowerCase();
    return mockContractInstances.get(key) || {};
  };
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn().mockImplementation((addr) => makeContract(addr)),
      Interface: actual.ethers.Interface,
      ZeroAddress: actual.ethers.ZeroAddress,
    },
    Contract: jest.fn().mockImplementation((addr) => makeContract(addr)),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockContractInstances.clear();
  jest.spyOn(console, 'log').mockImplementation(() => { });
  jest.spyOn(console, 'warn').mockImplementation(() => { });
  jest.spyOn(console, 'error').mockImplementation(() => { });
  jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit:${code}`);
  });

  mockResolveRpcUrl.mockReturnValue('http://127.0.0.1:8545');
  mockResolvePrivateKey.mockReturnValue('0x' + 'a'.repeat(64));
  mockGetProvider.mockReturnValue({
    getCode: jest.fn().mockResolvedValue('0x1234'),
  });
  mockGetSigner.mockReturnValue({});
  mockAcquireLock.mockReturnValue({ release: jest.fn() });
  mockConfirm.mockResolvedValue(true);
  mockSendTx.mockImplementation(async (fn) => {
    await fn();
    return { hash: '0xTxHash' };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function buildRegistryCallMap(entries) {
  const iface = new actualEthers.ethers.Interface([
    'function getById(uint32 id) view returns (tuple(uint32 contractId, string name, address contractAddr))',
  ]);
  const out = new Map();
  for (const [id, addr, name = `Contract${id}`] of entries) {
    out.set(Number(id), iface.encodeFunctionResult('getById', [[Number(id), name, addr]]));
  }
  return out;
}

describe('rollback command — real rollback.js path', () => {
  it('dry-run returns before confirmation, tx, checkpoint, and report', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());

    const rollback = require('../../libs/commands/cluster/rollback');
    await rollback({ rootDir: dir, args: { id: '210', 'dry-run': true } });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockAcquireLock).not.toHaveBeenCalled();
    expect(mockSendTx).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'rollback-checkpoint.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'rollback-report.json'))).toBe(false);
  });

  it('restores pods, writes report, updates project state, and removes checkpoint on success', async () => {
    const dir = makeTmpDir();
    const config = baseProject();
    writeProjectJson(dir, config);

    const clusterAddr = config.arkheion.clusterAddress;
    const targetAddr = config.arkheion.alldeployedcontracts[0].address;
    const currentAddr = config.arkheion.alldeployedcontracts[1].address;

    const registry = buildRegistryCallMap([
      [110, '0x' + 'd'.repeat(40), 'AccountStorage'],
      [610, '0x' + 'e'.repeat(40), 'MarketRegistry'],
    ]);

    mockContractInstances.set(clusterAddr.toLowerCase(), {
      deleteContract: jest.fn().mockResolvedValue({}),
      registerContract: jest.fn().mockResolvedValue({}),
      addActivePodAfterMount: jest.fn().mockResolvedValue({}),
      addPassivePodAfterMount: jest.fn().mockResolvedValue({}),
      runner: {
        provider: {
          call: jest.fn().mockImplementation(async ({ data }) => {
            const [id] = new actualEthers.ethers.Interface([
              'function getById(uint32 id) view returns (tuple(uint32 contractId, string name, address contractAddr))',
            ]).decodeFunctionData('getById', data);
            return registry.get(Number(id));
          }),
        },
      },
    });
    mockContractInstances.set(currentAddr.toLowerCase(), {
      getAllActiveModules: jest.fn().mockResolvedValue([{ contractId: 111n, moduleAddress: '0x' + 'f'.repeat(40) }]),
      getAllPassiveModules: jest.fn().mockResolvedValue([{ contractId: 611n, moduleAddress: '0x' + '9'.repeat(40) }]),
    });

    const checkpointSteps = [];
    mockSendTx.mockImplementation(async (fn, opts) => {
      if (opts.label.startsWith('registerContract')) {
        checkpointSteps.push(readJson(dir, 'rollback-checkpoint.json').step);
      }
      if (opts.label.startsWith('addActivePod')) {
        checkpointSteps.push(readJson(dir, 'rollback-checkpoint.json').step);
      }
      await fn();
      return { hash: '0xTxHash' };
    });

    const rollback = require('../../libs/commands/cluster/rollback');
    await rollback({ rootDir: dir, args: { id: '210', yes: true } });

    const updated = readProjectJson(dir);
    const current = updated.arkheion.alldeployedcontracts.find(r => r.address === currentAddr);
    const target = updated.arkheion.alldeployedcontracts.find(r => r.address === targetAddr);
    const report = readJson(dir, 'rollback-report.json');

    expect(checkpointSteps).toEqual(['B', 'C']);
    expect(fs.existsSync(path.join(dir, 'rollback-checkpoint.json'))).toBe(false);
    expect(current.status).toBe('deprecated');
    expect(current.podSnapshot).toEqual({ active: [{ contractId: 111 }], passive: [{ contractId: 611 }] });
    expect(target.status).toBe('mounted');
    expect(updated.arkheion.currentOperating).toBe(targetAddr);
    expect(updated.arkheion.runningcontracts).toEqual([
      expect.objectContaining({ address: targetAddr, contractId: 210, name: 'LendingEngine' }),
    ]);
    expect(report.errors).toEqual([]);
    expect(report.podRestoreResults).toEqual([
      expect.objectContaining({ contractId: 110, type: 'active', status: 'ok' }),
      expect.objectContaining({ contractId: 610, type: 'passive', status: 'ok' }),
    ]);
    expect(report.podRestoreResults[0].address.toLowerCase()).toBe(('0x' + 'd'.repeat(40)).toLowerCase());
    expect(report.podRestoreResults[1].address.toLowerCase()).toBe(('0x' + 'e'.repeat(40)).toLowerCase());
  });

  it('writes rollback-report and exits when Step B registerContract fails', async () => {
    const dir = makeTmpDir();
    const config = baseProject();
    writeProjectJson(dir, config);

    const clusterAddr = config.arkheion.clusterAddress;
    const currentAddr = config.arkheion.alldeployedcontracts[1].address;
    mockContractInstances.set(clusterAddr.toLowerCase(), {
      deleteContract: jest.fn().mockResolvedValue({}),
      registerContract: jest.fn().mockResolvedValue({}),
      runner: { provider: { call: jest.fn() } },
    });
    mockContractInstances.set(currentAddr.toLowerCase(), {
      getAllActiveModules: jest.fn().mockResolvedValue([]),
      getAllPassiveModules: jest.fn().mockResolvedValue([]),
    });

    mockSendTx.mockImplementation(async (fn, opts) => {
      if (opts.label.startsWith('registerContract')) {
        throw new Error('register revert');
      }
      await fn();
      return { hash: '0xTxHash' };
    });

    const rollback = require('../../libs/commands/cluster/rollback');
    await expect(rollback({ rootDir: dir, args: { id: '210', yes: true } })).rejects.toThrow('process.exit:1');

    const report = readJson(dir, 'rollback-report.json');
    const checkpoint = readJson(dir, 'rollback-checkpoint.json');
    expect(report.errors).toContain('Step B failed: register revert');
    expect(checkpoint.step).toBe('B');
  });

  it('records partial pod restore failures but still completes rollback', async () => {
    const dir = makeTmpDir();
    const config = baseProject();
    writeProjectJson(dir, config);

    const clusterAddr = config.arkheion.clusterAddress;
    const targetAddr = config.arkheion.alldeployedcontracts[0].address;
    const currentAddr = config.arkheion.alldeployedcontracts[1].address;
    const registry = buildRegistryCallMap([
      [110, '0x' + 'd'.repeat(40), 'AccountStorage'],
      [610, '0x' + 'e'.repeat(40), 'MarketRegistry'],
    ]);

    mockContractInstances.set(clusterAddr.toLowerCase(), {
      deleteContract: jest.fn().mockResolvedValue({}),
      registerContract: jest.fn().mockResolvedValue({}),
      addActivePodAfterMount: jest.fn().mockResolvedValue({}),
      addPassivePodAfterMount: jest.fn().mockResolvedValue({}),
      runner: {
        provider: {
          call: jest.fn().mockImplementation(async ({ data }) => {
            const [id] = new actualEthers.ethers.Interface([
              'function getById(uint32 id) view returns (tuple(uint32 contractId, string name, address contractAddr))',
            ]).decodeFunctionData('getById', data);
            return registry.get(Number(id));
          }),
        },
      },
    });
    mockContractInstances.set(currentAddr.toLowerCase(), {
      getAllActiveModules: jest.fn().mockResolvedValue([]),
      getAllPassiveModules: jest.fn().mockResolvedValue([]),
    });

    mockSendTx.mockImplementation(async (fn, opts) => {
      if (opts.label === 'addPassivePod contractId=610') {
        throw new Error('rpc timeout');
      }
      await fn();
      return { hash: '0xTxHash' };
    });

    const rollback = require('../../libs/commands/cluster/rollback');
    await rollback({ rootDir: dir, args: { id: '210', yes: true } });

    const updated = readProjectJson(dir);
    const report = readJson(dir, 'rollback-report.json');
    expect(updated.arkheion.currentOperating).toBe(targetAddr);
    expect(report.podRestoreResults).toEqual([
      expect.objectContaining({ contractId: 110, type: 'active', status: 'ok' }),
      { contractId: 610, type: 'passive', status: 'failed', error: 'rpc timeout' },
    ]);
    expect(report.podRestoreResults[0].address.toLowerCase()).toBe(('0x' + 'd'.repeat(40)).toLowerCase());
    expect(report.errors).toContain('Pod restore failed (passive contractId=610): rpc timeout');
    expect(fs.existsSync(path.join(dir, 'rollback-checkpoint.json'))).toBe(false);
  });
});
