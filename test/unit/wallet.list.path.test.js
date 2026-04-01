/**
 * Command-path regression test for wallet list.
 * Verifies that list.js calls getValidConfirmations() and uses that value
 * (not stale numConfirmations) to compute Ready/Pending status.
 *
 * Uses jest.resetModules() + require() inside each test to ensure
 * the ethers mock is picked up by list.js fresh each time.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MINIMAL_ABI = [
    { name: 'transactionCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'numConfirmationsRequired', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'transactions', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address', name: 'to' }, { type: 'uint256', name: 'value' }, { type: 'bytes', name: 'data' }, { type: 'bool', name: 'executed' }, { type: 'uint256', name: 'numConfirmations' }] },
    { name: 'getValidConfirmations', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
];

function makeTmpDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkheion-list-test-'));
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
        network: { rpc: 'http://localhost:8545' },
        account: { privateKey: '0x' + 'a'.repeat(64) },
        arkheion: { multisigAddress: '0x' + '1'.repeat(40) },
    }), 'utf-8');
    const artifactDir = path.join(dir, 'artifacts', 'contracts', 'undeployed', 'wallet', 'multisigwallet.sol');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, 'MultiSigWallet.json'), JSON.stringify({ abi: MINIMAL_ABI }), 'utf-8');
    return dir;
}

function makeStub(overrides = {}) {
    return {
        transactionCount: jest.fn().mockResolvedValue(1n),
        numConfirmationsRequired: jest.fn().mockResolvedValue(2n),
        transactions: jest.fn().mockResolvedValue({
            to: '0x' + '2'.repeat(40), value: 0n, data: '0x',
            executed: false, numConfirmations: 1n,
        }),
        getValidConfirmations: jest.fn().mockResolvedValue(2n),
        ...overrides,
    };
}

function loadList(stub) {
    jest.resetModules();
    jest.doMock('ethers', () => {
        const actual = jest.requireActual('ethers');
        const MockContract = jest.fn(() => stub);
        return {
            ...actual,
            Contract: MockContract,
            ethers: { ...actual.ethers, Contract: MockContract },
        };
    });
    jest.doMock('../../chain/provider', () => ({ getProvider: jest.fn(() => ({})) }));
    return require('../../libs/commands/wallet/list');
}

beforeEach(() => {
    jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
    // jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
});

describe('wallet list command path', () => {
    it('calls getValidConfirmations and uses it for Ready status (not stale numConfirmations)', async () => {
        const stub = makeStub({
            numConfirmationsRequired: jest.fn().mockResolvedValue(2n),
            transactions: jest.fn().mockResolvedValue({
                to: '0x' + '2'.repeat(40), value: 0n, data: '0x',
                executed: false, numConfirmations: 1n, // stale
            }),
            getValidConfirmations: jest.fn().mockResolvedValue(2n), // live = meets threshold
        });
        const listCmd = loadList(stub);

        const logs = [];
        jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));

        await listCmd({ rootDir: makeTmpDir(), args: {} });

        expect(stub.getValidConfirmations).toHaveBeenCalledWith(0);
        const output = logs.join('\n');
        expect(output).toMatch(/Ready/);
        expect(output).toMatch(/2\/2/);
    });

    it('shows Pending when valid confirmations are below threshold', async () => {
        const stub = makeStub({
            numConfirmationsRequired: jest.fn().mockResolvedValue(3n),
            transactions: jest.fn().mockResolvedValue({
                to: '0x' + '2'.repeat(40), value: 0n, data: '0x',
                executed: false, numConfirmations: 3n, // stale high
            }),
            getValidConfirmations: jest.fn().mockResolvedValue(1n), // only 1 valid
        });
        const listCmd = loadList(stub);

        const logs = [];
        jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));

        await listCmd({ rootDir: makeTmpDir(), args: {} });

        expect(stub.getValidConfirmations).toHaveBeenCalledWith(0);
        const output = logs.join('\n');
        expect(output).toMatch(/Pending/);
        expect(output).toMatch(/1\/3/);
    });

    it('shows Executed for executed transactions', async () => {
        const stub = makeStub({
            transactions: jest.fn().mockResolvedValue({
                to: '0x' + '2'.repeat(40), value: 0n, data: '0x',
                executed: true, numConfirmations: 2n,
            }),
            getValidConfirmations: jest.fn().mockResolvedValue(2n),
        });
        const listCmd = loadList(stub);

        const logs = [];
        jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));

        await listCmd({ rootDir: makeTmpDir(), args: {} });

        const output = logs.join('\n');
        expect(output).toMatch(/Executed/);
    });
});
