/**
 * CLI 集成测试
 * 通过 child_process 直接运行 cli/index.js，验证命令路由和输出
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI = path.join(__dirname, '../../cli/index.js');

function runCLI(args = [], env = {}, cwd = undefined) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: cwd || path.join(__dirname, '../../')
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status
  };
}

describe('CLI 集成测试', () => {

  // ──────────────────────────────────────────────
  // 版本 / 帮助 flags
  // ──────────────────────────────────────────────
  describe('全局 flags', () => {
    it('--version / -v 输出版本号', () => {
      const r = runCLI(['--version']);
      expect(r.stdout + r.stderr).toMatch(/\d+\.\d+\.\d+/);
    });

    it('-v 同样输出版本号', () => {
      const r = runCLI(['-v']);
      expect(r.stdout + r.stderr).toMatch(/\d+\.\d+\.\d+/);
    });

    it('--help 不崩溃', () => {
      const r = runCLI(['--help']);
      expect(r.code).not.toBe(1);
    });

    it('-h 不崩溃', () => {
      const r = runCLI(['-h']);
      expect(r.code).not.toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // 未知命令
  // ──────────────────────────────────────────────
  describe('未知命令', () => {
    it('完全陌生的命令打印错误提示', () => {
      const r = runCLI(['nonexistent-command-xyz']);
      expect(r.stdout + r.stderr).toMatch(/unknown command|error|not found/i);
    });

    it('空参数不崩溃', () => {
      const r = runCLI([]);
      expect(r.code).not.toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // help 命令
  // ──────────────────────────────────────────────
  describe('help 命令', () => {
    it('arkheion help 调用成功（handler 存在）', () => {
      const r = runCLI(['help']);
      // help handler 存在，不应该打印 "Failed to load handler" 类的错误
      expect(r.stdout + r.stderr).not.toMatch(/failed to load handler/i);
    });
  });

  // ──────────────────────────────────────────────
  // 命令路由验证（通过日志输出验证命令被正确识别）
  // ──────────────────────────────────────────────
  describe('命令路由 - 通过日志验证', () => {
    it('wallet submit 路由正确（Command 日志显示 wallet submit）', () => {
      // wallet submit 会因为缺少网络配置而失败，但 Command 日志一定在失败前输出
      const r = runCLI(['wallet', 'submit', '--to', '0x0', '--data', '0x']);
      expect(r.stdout).toContain('wallet submit');
    });

    it('cluster init 路由正确', () => {
      const r = runCLI(['cluster', 'init']);
      expect(r.stdout).toContain('cluster init');
    });

    it('wallet confirm 路由正确', () => {
      const r = runCLI(['wallet', 'confirm', '--txIndex', '0']);
      expect(r.stdout).toContain('wallet confirm');
    });

    it('cluster list mounted 路由正确', () => {
      const r = runCLI(['cluster', 'list', 'mounted']);
      expect(r.stdout).toContain('cluster list mounted');
    });

    it('wallet propose add-owner 路由正确', () => {
      const r = runCLI(['wallet', 'propose', 'add-owner', '--address', '0x0']);
      expect(r.stdout).toContain('wallet propose add-owner');
    });
  });

  // ──────────────────────────────────────────────
  // 前置校验 (preflight) — child-process 级退出码断言
  // ──────────────────────────────────────────────
  describe('preflight prerequisite enforcement', () => {
    let emptyDir;

    beforeAll(() => {
      emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-preflight-'));
    });

    afterAll(() => {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('deploy before init → exit code 1', () => {
      const r = runCLI(['deploy', '--contract', 'Foo'], {}, emptyDir);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/arkheion init/);
    });

    it('cluster init before init → exit code 1', () => {
      const r = runCLI(['cluster', 'init'], {}, emptyDir);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/arkheion init/);
    });

    it('cluster mount before cluster init → exit code 1', () => {
      const projPath = path.join(emptyDir, 'project.json');
      fs.writeFileSync(projPath, JSON.stringify({
        network: { rpc: 'http://localhost' },
        account: { address: '0x1' }
      }));

      const r = runCLI(['cluster', 'mount', '1', 'Test'], {}, emptyDir);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/arkheion cluster init/);

      fs.unlinkSync(projPath);
    });
  });
});
