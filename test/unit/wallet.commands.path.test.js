/**
 * Command-path regression tests for wallet invasive commands.
 * Verifies --yes bypass and deny-early-return (no lock, no tx) for:
 * submit, confirm, execute, revoke, propose
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const ethers = require('ethers');

// ─── helpers ──────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
    network: { rpc: 'http://localhost:8545' },
    account: { privateKey: '0x' + 'a'.repeat(64) },
    arkheion: { multisigAddress: '0x' + '1'.repeat(40) },
};

const MINIMAL_ABI = [
    { name: 'isConfirmed', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
    { name: 'getValidConfirmations', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
    { name: 'numConfirmationsRequired', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'transactions', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address', name: 'to' }, { type: 'uint256', name: 'value' }, { type: 'bytes', name: 'data' }, { type: 'bool', name: 'executed' }, { type: 'uint256', name: 'numConfirmations' }] },
    { name: 'confirmTransaction', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
    { name: 'executeTransaction', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
    { name: 'revokeConfirmation', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
    { name: 'submitTransaction', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }], outputs: [] },
    { name: 'proposeAddOwner', type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }], outputs: [] },
];

function makeTmpDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-wallet-test-'));
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(BASE_CONFIG), 'utf-8');
    const artifactDir = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'wallet', 'multisigwallet.sol');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'MultiSigWallet.json'), JSON.stringify({ abi: MINIMAL_ABI }), 'utf-8');
    return dir;
}

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../libs/commands/confirm', () => ({ confirm: jest.fn() }));
jest.mock('../../libs/commands/clusterLock', () => ({ acquireLock: jest.fn() }));
jest.mock('../../libs/commands/txExecutor', () => ({ sendTx: jest.fn() }));
jest.mock('../../chain/provider', () => ({ getProvider: jest.fn(() => ({})) }));
jest.mock('../../wallet/signer', () => ({
    getSigner: jest.fn(() => ({ address: '0x' + 'a'.repeat(40) })),
}));

const { confirm: mockConfirm } = require('../../libs/commands/confirm');
const { acquireLock: mockAcquireLock } = require('../../libs/commands/clusterLock');
const { sendTx: mockSendTx } = require('../../libs/commands/txExecutor');

// Contract stub — patched onto ethers.Contract via spyOn in beforeEach
const contractStub = {
    isConfirmed: jest.fn(),
    getValidConfirmations: jest.fn(),
    numConfirmationsRequired: jest.fn(),
    transactions: jest.fn(),
    confirmTransaction: jest.fn(),
    executeTransaction: jest.fn(),
    revokeConfirmation: jest.fn(),
    submitTransaction: jest.fn(),
    proposeAddOwner: jest.fn(),
    interface: { parseLog: () => null },
};

function resetStub() {
    contractStub.isConfirmed.mockResolvedValue(false);
    contractStub.getValidConfirmations.mockResolvedValue(1n);
    contractStub.numConfirmationsRequired.mockResolvedValue(2n);
    contractStub.transactions.mockResolvedValue({ to: '0x' + '2'.repeat(40), value: 0n, data: '0x', executed: false, numConfirmations: 3n });
    contractStub.confirmTransaction.mockResolvedValue({});
    contractStub.executeTransaction.mockResolvedValue({});
    contractStub.revokeConfirmation.mockResolvedValue({});
    contractStub.submitTransaction.mockResolvedValue({});
    contractStub.proposeAddOwner.mockResolvedValue({});
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
    mockAcquireLock.mockReturnValue({ release: jest.fn() });
    mockSendTx.mockResolvedValue({ logs: [] });
    // Patch ethers.Contract and ethers.ethers.Contract to return stub
    jest.spyOn(ethers, 'Contract').mockImplementation(() => contractStub);
    jest.spyOn(ethers.ethers, 'Contract').mockImplementation(() => contractStub);
    resetStub();
});

afterEach(() => jest.restoreAllMocks());

// ─── submit ───────────────────────────────────────────────────────────────────

describe('wallet submit command path', () => {
    const submitCmd = require('../../libs/commands/wallet/submit');

    it('deny: returns early, no lock, no sendTx', async () => {
        mockConfirm.mockResolvedValue(false);
        await submitCmd({ rootDir: makeTmpDir(), args: { to: '0x' + '2'.repeat(40), value: '0', data: '0x1234' } });
        expect(mockAcquireLock).not.toHaveBeenCalled();
        expect(mockSendTx).not.toHaveBeenCalled();
    });

    it('--yes: confirm called with true, proceeds to sendTx', async () => {
        mockConfirm.mockResolvedValue(true);
        await submitCmd({ rootDir: makeTmpDir(), args: { to: '0x' + '2'.repeat(40), value: '0', data: '0x1234', yes: true } });
        expect(mockConfirm).toHaveBeenCalledWith(expect.any(String), true);
        expect(mockSendTx).toHaveBeenCalled();
    });
});

// ─── confirm ──────────────────────────────────────────────────────────────────

describe('wallet confirm command path', () => {
    const confirmCmd = require('../../libs/commands/wallet/confirm');

    it('deny: returns early, no lock, no sendTx', async () => {
        mockConfirm.mockResolvedValue(false);
        await confirmCmd({ rootDir: makeTmpDir(), args: { txIndex: 0 } });
        expect(mockAcquireLock).not.toHaveBeenCalled();
        expect(mockSendTx).not.toHaveBeenCalled();
    });

    it('--yes: confirm called with true, acquires lock, sends tx', async () => {
        mockConfirm.mockResolvedValue(true);
        contractStub.isConfirmed.mockResolvedValue(false);
        await confirmCmd({ rootDir: makeTmpDir(), args: { txIndex: 0, yes: true } });
        expect(mockConfirm).toHaveBeenCalledWith(expect.any(String), true);
        expect(mockAcquireLock).toHaveBeenCalled();
        expect(mockSendTx).toHaveBeenCalled();
    });
});

// ─── execute ──────────────────────────────────────────────────────────────────

describe('wallet execute command path', () => {
    const executeCmd = require('../../libs/commands/wallet/execute');

    it('deny: returns early, no lock, no sendTx', async () => {
        mockConfirm.mockResolvedValue(false);
        await executeCmd({ rootDir: makeTmpDir(), args: { txIndex: 0 } });
        expect(mockAcquireLock).not.toHaveBeenCalled();
        expect(mockSendTx).not.toHaveBeenCalled();
    });

    it('--yes: confirm called with true, acquires lock, sends tx when threshold met', async () => {
        mockConfirm.mockResolvedValue(true);
        contractStub.transactions.mockResolvedValue({ to: '0x' + '2'.repeat(40), value: 0n, data: '0x', executed: false, numConfirmations: 3n });
        contractStub.numConfirmationsRequired.mockResolvedValue(2n);
        contractStub.getValidConfirmations.mockResolvedValue(2n);
        await executeCmd({ rootDir: makeTmpDir(), args: { txIndex: 0, yes: true } });
        expect(mockConfirm).toHaveBeenCalledWith(expect.any(String), true);
        expect(mockAcquireLock).toHaveBeenCalled();
        expect(mockSendTx).toHaveBeenCalled();
    });
});

// ─── revoke ───────────────────────────────────────────────────────────────────

describe('wallet revoke command path', () => {
    const revokeCmd = require('../../libs/commands/wallet/revoke');

    it('deny: returns early, no lock, no sendTx', async () => {
        mockConfirm.mockResolvedValue(false);
        await revokeCmd({ rootDir: makeTmpDir(), args: { txIndex: 0 } });
        expect(mockAcquireLock).not.toHaveBeenCalled();
        expect(mockSendTx).not.toHaveBeenCalled();
    });

    it('--yes: confirm called with true, acquires lock, sends tx when confirmed', async () => {
        mockConfirm.mockResolvedValue(true);
        contractStub.isConfirmed.mockResolvedValue(true);
        contractStub.getValidConfirmations.mockResolvedValue(1n);
        contractStub.numConfirmationsRequired.mockResolvedValue(2n);
        await revokeCmd({ rootDir: makeTmpDir(), args: { txIndex: 0, yes: true } });
        expect(mockConfirm).toHaveBeenCalledWith(expect.any(String), true);
        expect(mockAcquireLock).toHaveBeenCalled();
        expect(mockSendTx).toHaveBeenCalled();
    });
});

// ─── propose ──────────────────────────────────────────────────────────────────

describe('wallet propose command path', () => {
    const proposeCmd = require('../../libs/commands/wallet/propose');

    it('deny: returns early, no lock, no sendTx', async () => {
        mockConfirm.mockResolvedValue(false);
        await proposeCmd({ rootDir: makeTmpDir(), args: { address: '0x' + '3'.repeat(40) }, subcommands: ['propose', 'add-owner'] });
        expect(mockAcquireLock).not.toHaveBeenCalled();
        expect(mockSendTx).not.toHaveBeenCalled();
    });

    it('--yes: confirm called with true, acquires lock, sends tx', async () => {
        mockConfirm.mockResolvedValue(true);
        await proposeCmd({ rootDir: makeTmpDir(), args: { address: '0x' + '3'.repeat(40), yes: true }, subcommands: ['propose', 'add-owner'] });
        expect(mockConfirm).toHaveBeenCalledWith(expect.any(String), true);
        expect(mockAcquireLock).toHaveBeenCalled();
        expect(mockSendTx).toHaveBeenCalled();
    });
});
