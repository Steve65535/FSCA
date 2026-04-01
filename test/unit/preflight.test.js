/**
 * Unit tests for libs/commands/preflight.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { inferState, assertPrerequisites } = require('../../libs/commands/preflight');

describe('preflight', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeConfig(obj) {
        fs.writeFileSync(path.join(tmpDir, 'project.json'), JSON.stringify(obj));
    }

    // ── inferState ──

    describe('inferState', () => {
        test('no project.json → uninitialized', () => {
            const { level } = inferState(tmpDir);
            expect(level).toBe('uninitialized');
        });

        test('invalid JSON → uninitialized', () => {
            fs.writeFileSync(path.join(tmpDir, 'project.json'), '{bad');
            const { level } = inferState(tmpDir);
            expect(level).toBe('uninitialized');
        });

        test('missing network → uninitialized', () => {
            writeConfig({ account: { address: '0x1' } });
            const { level } = inferState(tmpDir);
            expect(level).toBe('uninitialized');
        });

        test('missing account → uninitialized', () => {
            writeConfig({ network: { rpc: 'http://localhost' } });
            const { level } = inferState(tmpDir);
            expect(level).toBe('uninitialized');
        });

        test('network + account → initialized', () => {
            writeConfig({ network: { rpc: 'http://localhost' }, account: { address: '0x1' } });
            const { level } = inferState(tmpDir);
            expect(level).toBe('initialized');
        });

        test('partial infra addresses → initialized', () => {
            writeConfig({
                network: { rpc: 'http://localhost' },
                account: { address: '0x1' },
                arkheion: { clusterAddress: '0xC' }
            });
            const { level } = inferState(tmpDir);
            expect(level).toBe('initialized');
        });

        test('all 4 infra addresses → cluster_ready', () => {
            writeConfig({
                network: { rpc: 'http://localhost' },
                account: { address: '0x1' },
                arkheion: {
                    clusterAddress: '0xC',
                    multisigAddress: '0xM',
                    evokerManagerAddress: '0xE',
                    rightManagerAddress: '0xR'
                }
            });
            const { level } = inferState(tmpDir);
            expect(level).toBe('cluster_ready');
        });

        test('multiSigAddress (camelCase variant) also accepted', () => {
            writeConfig({
                network: { rpc: 'http://localhost' },
                account: { address: '0x1' },
                arkheion: {
                    clusterAddress: '0xC',
                    multiSigAddress: '0xM',
                    evokerManagerAddress: '0xE',
                    rightManagerAddress: '0xR'
                }
            });
            const { level } = inferState(tmpDir);
            expect(level).toBe('cluster_ready');
        });
    });

    // ── assertPrerequisites ──

    describe('assertPrerequisites', () => {
        test('empty requires → ok', () => {
            const result = assertPrerequisites(tmpDir, []);
            expect(result.ok).toBe(true);
        });

        test('null requires → ok', () => {
            const result = assertPrerequisites(tmpDir, null);
            expect(result.ok).toBe(true);
        });

        test('initialized required, no project.json → blocked', () => {
            const result = assertPrerequisites(tmpDir, ['initialized']);
            expect(result.ok).toBe(false);
            expect(result.message).toMatch(/arkheion init/);
        });

        test('initialized required, project exists → ok', () => {
            writeConfig({ network: { rpc: 'x' }, account: { address: '0x1' } });
            const result = assertPrerequisites(tmpDir, ['initialized']);
            expect(result.ok).toBe(true);
        });

        test('cluster_ready required, only initialized → blocked', () => {
            writeConfig({ network: { rpc: 'x' }, account: { address: '0x1' } });
            const result = assertPrerequisites(tmpDir, ['cluster_ready']);
            expect(result.ok).toBe(false);
            expect(result.message).toMatch(/arkheion cluster init/);
        });

        test('cluster_ready required, fully configured → ok', () => {
            writeConfig({
                network: { rpc: 'x' },
                account: { address: '0x1' },
                arkheion: {
                    clusterAddress: '0xC',
                    multisigAddress: '0xM',
                    evokerManagerAddress: '0xE',
                    rightManagerAddress: '0xR'
                }
            });
            const result = assertPrerequisites(tmpDir, ['cluster_ready']);
            expect(result.ok).toBe(true);
        });

        test('current_contract_selected, no currentOperating → blocked', () => {
            writeConfig({
                network: { rpc: 'x' },
                account: { address: '0x1' },
                arkheion: {
                    clusterAddress: '0xC',
                    multisigAddress: '0xM',
                    evokerManagerAddress: '0xE',
                    rightManagerAddress: '0xR'
                }
            });
            const result = assertPrerequisites(tmpDir, ['current_contract_selected']);
            expect(result.ok).toBe(false);
            expect(result.message).toMatch(/arkheion cluster choose/);
        });

        test('current_contract_selected, currentOperating set → ok', () => {
            writeConfig({
                network: { rpc: 'x' },
                account: { address: '0x1' },
                arkheion: {
                    clusterAddress: '0xC',
                    multisigAddress: '0xM',
                    evokerManagerAddress: '0xE',
                    rightManagerAddress: '0xR',
                    currentOperating: '0xBiz'
                }
            });
            const result = assertPrerequisites(tmpDir, ['current_contract_selected']);
            expect(result.ok).toBe(true);
        });

        test('current_contract_selected without cluster_ready → blocked with cluster init message', () => {
            writeConfig({ network: { rpc: 'x' }, account: { address: '0x1' } });
            const result = assertPrerequisites(tmpDir, ['current_contract_selected']);
            expect(result.ok).toBe(false);
            expect(result.message).toMatch(/arkheion cluster init/);
        });
    });

    // ── executor integration ──

    describe('executor preflight integration', () => {
        const { CommandExecutor } = require('../../cli/executor');
        let exitSpy;

        beforeEach(() => {
            exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
                throw new Error(`process.exit(${code})`);
            });
        });

        afterEach(() => {
            exitSpy.mockRestore();
        });

        test('command with requires=["initialized"] blocked when no project.json → exit(1)', async () => {
            const executor = new CommandExecutor();
            const logs = [];
            const origError = console.error;
            console.error = (...a) => logs.push(a.join(' '));

            await expect(executor.execute({
                handler: './libs/commands/deploy',
                command: 'deploy',
                subcommands: ['deploy'],
                args: { contract: 'Foo' },
                config: { requires: ['initialized'] }
            }, tmpDir)).rejects.toThrow('process.exit(1)');

            console.error = origError;
            expect(logs.some(l => l.includes('arkheion init'))).toBe(true);
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        test('command with requires=["cluster_ready"] blocked when only initialized → exit(1)', async () => {
            writeConfig({ network: { rpc: 'x' }, account: { address: '0x1' } });
            const executor = new CommandExecutor();
            const logs = [];
            const origError = console.error;
            console.error = (...a) => logs.push(a.join(' '));

            await expect(executor.execute({
                handler: './libs/commands/wallet/submit',
                command: 'wallet submit',
                subcommands: ['wallet', 'submit'],
                args: {},
                config: { requires: ['cluster_ready'] }
            }, tmpDir)).rejects.toThrow('process.exit(1)');

            console.error = origError;
            expect(logs.some(l => l.includes('arkheion cluster init'))).toBe(true);
            expect(exitSpy).toHaveBeenCalledWith(1);
        });

        test('command with no requires proceeds to handler', async () => {
            const executor = new CommandExecutor();
            // help has no requires, should not be blocked
            await executor.execute({
                handler: './libs/commands/help',
                command: 'help',
                subcommands: ['help'],
                args: {},
                config: {}
            }, tmpDir);
            // help doesn't throw, just prints — if we got here without error, preflight passed
            expect(exitSpy).not.toHaveBeenCalled();
        });
    });
});
