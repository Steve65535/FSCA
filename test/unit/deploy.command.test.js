const fs = require('fs');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-deploy-test-'));
}

function writeProjectJson(dir, data) {
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function readProjectJson(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf-8'));
}

function baseProject() {
  return {
    network: { name: 'localnet', rpc: 'http://127.0.0.1:8545' },
    account: { privateKey: '0x' + 'a'.repeat(64) },
    arkheion: {
      clusterAddress: '0x' + '1'.repeat(40),
      alldeployedcontracts: [
        {
          name: 'OldEngine',
          address: '0x' + '2'.repeat(40),
          contractId: null,
          generation: null,
          deploySeq: 2,
          status: 'deployed',
          timeStamp: 1000,
          deployTx: '0xOld',
          podSnapshot: { active: [], passive: [] },
        },
      ],
      unmountedcontracts: [],
      cleanupPolicy: { defaultMode: 'keep' },
    },
  };
}

function writeArtifact(dir, contractName) {
  const artifactDir = path.join(dir, 'artifacts', 'contracts', 'undeployed', `${contractName}.sol`);
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, `${contractName}.json`), JSON.stringify({
    abi: [],
    bytecode: '0x6000',
  }), 'utf-8');
}

function writeTemplateSource(dir) {
  const p = path.join(dir, 'contracts', 'undeployed', 'lib');
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'normaltemplate.sol'), 'contract NormalTemplate {}', 'utf-8');
}

const mockConfirm = jest.fn();
const mockExecSync = jest.fn();
const mockResolveCleanupMode = jest.fn();
const mockPerformCleanup = jest.fn();
const mockFindSourceFile = jest.fn();
const mockFindArtifactFile = jest.fn();
const mockScanContractConflicts = jest.fn();
const mockScanAllConflicts = jest.fn();
const mockScanIdConflicts = jest.fn();
const mockFailOnConflict = jest.fn();
const mockFailOnAllConflicts = jest.fn();

jest.mock('../../libs/commands/confirm', () => ({ confirm: (...args) => mockConfirm(...args) }));
jest.mock('child_process', () => ({ execSync: (...args) => mockExecSync(...args) }));
jest.mock('../../chain/provider', () => ({ getProvider: jest.fn(() => ({})) }));
jest.mock('../../wallet/signer', () => ({ getSigner: jest.fn(() => ({})) }));
jest.mock('../../libs/commands/cleanup', () => ({
  resolveCleanupMode: (...args) => mockResolveCleanupMode(...args),
  performCleanup: (...args) => mockPerformCleanup(...args),
  findSourceFile: (...args) => mockFindSourceFile(...args),
  findArtifactFile: (...args) => mockFindArtifactFile(...args),
}));
jest.mock('../../libs/commands/contractConflicts', () => ({
  scanContractConflicts: (...args) => mockScanContractConflicts(...args),
  scanAllConflicts: (...args) => mockScanAllConflicts(...args),
  scanIdConflicts: (...args) => mockScanIdConflicts(...args),
  failOnConflict: (...args) => mockFailOnConflict(...args),
  failOnAllConflicts: (...args) => mockFailOnAllConflicts(...args),
}));

const contractStub = {
  deploymentTransaction: jest.fn(),
  waitForDeployment: jest.fn(),
  getAddress: jest.fn(),
};

const factoryDeploy = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => { });
  jest.spyOn(console, 'warn').mockImplementation(() => { });
  jest.spyOn(console, 'error').mockImplementation(() => { });
  jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit:${code}`);
  });

  mockConfirm.mockResolvedValue(true);
  mockResolveCleanupMode.mockReturnValue('soft');
  mockPerformCleanup.mockReturnValue({ actions: [{ fileType: 'source', action: 'archived', status: 'ok' }], errors: [] });
  mockFindSourceFile.mockReturnValue('/tmp/source.sol');
  mockFindArtifactFile.mockReturnValue('/tmp/artifact.json');
  mockScanContractConflicts.mockReturnValue({ hits: [], conflict: false });
  mockScanAllConflicts.mockReturnValue({ duplicateNames: [], duplicateDescriptions: [] });
  mockScanIdConflicts.mockReturnValue({ idConflicts: [] });

  contractStub.deploymentTransaction.mockReturnValue({ hash: '0xDeployTx' });
  contractStub.waitForDeployment.mockResolvedValue(undefined);
  contractStub.getAddress.mockResolvedValue('0x' + '3'.repeat(40));
  factoryDeploy.mockResolvedValue(contractStub);

  jest.spyOn(ethers, 'ContractFactory').mockImplementation(() => ({ deploy: factoryDeploy }));
  jest.spyOn(ethers.ethers, 'ContractFactory').mockImplementation(() => ({ deploy: factoryDeploy }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deploy command — real deploy.js path', () => {
  it('returns early when confirmation is denied', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());
    writeArtifact(dir, 'TradeEngine');
    writeTemplateSource(dir);

    mockConfirm.mockResolvedValue(false);

    const deploy = require('../../libs/commands/deploy');
    await deploy({ rootDir: dir, args: { contract: 'TradeEngine' } });

    expect(mockExecSync).not.toHaveBeenCalled();
    expect(factoryDeploy).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, 'cleanup-report.json'))).toBe(false);
  });

  it('deploys, archives, writes cleanup-report, and updates deploySeq/currentOperating', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());
    writeArtifact(dir, 'TradeEngine');
    writeTemplateSource(dir);

    const deploy = require('../../libs/commands/deploy');
    await deploy({ rootDir: dir, args: { contract: 'TradeEngine', description: 'TradeEngineV2', cleanup: 'soft', yes: true } });

    const updated = readProjectJson(dir);
    const newRecord = updated.arkheion.alldeployedcontracts.find(r => r.address === '0x' + '3'.repeat(40));
    const cleanupReport = JSON.parse(fs.readFileSync(path.join(dir, 'cleanup-report.json'), 'utf-8'));
    const deployedDir = path.join(dir, 'contracts', 'deployed');

    expect(mockExecSync).toHaveBeenCalledWith('npx hardhat compile', expect.objectContaining({ cwd: dir, stdio: 'inherit' }));
    expect(factoryDeploy).toHaveBeenCalledWith('0x' + '1'.repeat(40), 'TradeEngineV2');
    expect(newRecord).toEqual(expect.objectContaining({
      name: 'TradeEngineV2',
      address: '0x' + '3'.repeat(40),
      deploySeq: 3,
      status: 'deployed',
      deployTx: '0xDeployTx',
      podSnapshot: { active: [], passive: [] },
    }));
    expect(updated.arkheion.unmountedcontracts).toEqual([
      expect.objectContaining({ address: '0x' + '3'.repeat(40), name: 'TradeEngineV2', deploySeq: 3 }),
    ]);
    expect(updated.arkheion.currentOperating).toBe('0x' + '3'.repeat(40));
    expect(cleanupReport.mode).toBe('soft');
    expect(fs.existsSync(deployedDir)).toBe(true);
    expect(fs.readdirSync(deployedDir).some(name => name.startsWith('normaltemplate_TradeEngineV2_'))).toBe(true);
    expect(fs.readdirSync(deployedDir).some(name => name.startsWith('TradeEngineV2_') && name.endsWith('.json'))).toBe(true);
  });

  it('supports --cleanup hard and writes deletion report', async () => {
    const dir = makeTmpDir();
    writeProjectJson(dir, baseProject());
    writeArtifact(dir, 'RiskEngine');
    writeTemplateSource(dir);

    mockResolveCleanupMode.mockReturnValue('hard');
    mockPerformCleanup.mockReturnValue({
      actions: [
        { fileType: 'source', action: 'deleted', status: 'ok' },
        { fileType: 'artifact', action: 'deleted', status: 'ok' },
      ],
      errors: [],
    });

    const deploy = require('../../libs/commands/deploy');
    await deploy({ rootDir: dir, args: { contract: 'RiskEngine', cleanup: 'hard', yes: true } });

    const cleanupReport = JSON.parse(fs.readFileSync(path.join(dir, 'cleanup-report.json'), 'utf-8'));
    expect(cleanupReport.mode).toBe('hard');
    expect(cleanupReport.actions).toEqual([
      expect.objectContaining({ fileType: 'source', action: 'deleted', status: 'ok' }),
      expect.objectContaining({ fileType: 'artifact', action: 'deleted', status: 'ok' }),
    ]);
  });
});
