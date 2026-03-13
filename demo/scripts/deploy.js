/**
 * FSCA Demo 完整部署脚本
 *
 * 复用 fsca-cli 封装：
 *   chain/provider  → getProvider(rpcUrl)
 *   wallet/signer   → getSigner(privateKey, provider)
 *   chain/deploy    → deployContract(signer, abi, bytecode, args)
 *   chain/tx        → callContract(signer, addr, abi, fn, args)
 *
 * 配置来源：demo/project.json
 * 编译产物：demo/artifacts/（由 npx hardhat compile 生成）
 *
 * 前置：
 *   npx hardhat compile        （在 demo/ 目录下）
 *   npx hardhat node           （另一个终端，或使用真实链）
 *
 * 运行：
 *   node scripts/deploy.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');

// ── 复用 CLI 封装模块 ──────────────────────────────────────────────
const { getProvider }     = require('../../chain/provider');
const { getSigner }       = require('../../wallet/signer');
const { deployContract }  = require('../../chain/deploy');
const { callContract }    = require('../../chain/tx');

// ── Demo 根目录 ──────────────────────────────────────────────────
const DEMO_DIR = path.join(__dirname, '..');

// ── ClusterManager 最小 ABI（仅用到的函数）────────────────────────
const CLUSTER_ABI = [
    'function setEvokerManager(address _evoker) external',
    'function registerContract(uint32 id, string memory name, address contractAddr) external',
    'function deleteContract(uint32 id) external',
    'function addActivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addActivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function getById(uint32 id) view returns (tuple(uint32 contractId, string name, address contractAddr))',
];

// ── normalTemplate 最小 ABI（查余额用）────────────────────────────
const TRADE_ABI = [
    'function deposit(uint32 tokenId, uint256 amount) external',
    'function transfer(uint32 tokenId, address to, uint256 amount) external',
    'function getBalance(uint32 tokenId, address user) view returns (uint256)',
];

// ─────────────────────────────────────────────────────────────────
// 工具函数（与 libs/commands 风格一致）
// ─────────────────────────────────────────────────────────────────

function loadProjectConfig() {
    const p = path.join(DEMO_DIR, 'project.json');
    if (!fs.existsSync(p)) throw new Error('project.json not found');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveProjectConfig(config) {
    fs.writeFileSync(path.join(DEMO_DIR, 'project.json'), JSON.stringify(config, null, 2));
}

/**
 * 从 demo/artifacts/ 中按合约名查找 artifact
 * 支持多级子目录（core/structure/, storage/, logic/ 等）
 */
function loadArtifact(contractName) {
    const base = path.join(DEMO_DIR, 'artifacts', 'contracts');
    const candidates = [
        path.join(base, 'storage',          `${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'logic',            `${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'core', 'structure',`${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'core', 'lib',      `${contractName}.sol`, `${contractName}.json`),
        path.join(base,                     `${contractName}.sol`, `${contractName}.json`),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    throw new Error(`Artifact not found for "${contractName}". Run: npx hardhat compile`);
}

// ─────────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────────

async function main() {
    // 1. 读配置
    const config  = loadProjectConfig();
    const provider = getProvider(config.network.rpc);
    const signer   = getSigner(config.account.privateKey, provider);
    const deployer = await signer.getAddress();

    console.log('='.repeat(60));
    console.log('FSCA Demo Deployment');
    console.log('='.repeat(60));
    console.log('Network  :', config.network.rpc);
    console.log('Deployer :', deployer, '\n');

    // 2. 编译
    console.log('Compiling contracts...');
    execSync('npx hardhat compile', { cwd: DEMO_DIR, stdio: 'inherit' });
    console.log();

    // ── Phase 1: 基础设施 ─────────────────────────────────────────
    console.log('>>> Phase 1: ClusterManager + EvokerManager');

    const clusterArt = loadArtifact('ClusterManager');
    const clusterAddr = await deployContract(signer, clusterArt.abi, clusterArt.bytecode, [deployer]);
    console.log('  ClusterManager:', clusterAddr);

    const evokerArt = loadArtifact('EvokerManager');
    const evokerAddr = await deployContract(signer, evokerArt.abi, evokerArt.bytecode, [clusterAddr]);
    console.log('  EvokerManager :', evokerAddr);

    await callContract(signer, clusterAddr, CLUSTER_ABI, 'setEvokerManager', [evokerAddr]);
    console.log('  Linked\n');

    // ── Phase 2: 业务合约 ─────────────────────────────────────────
    console.log('>>> Phase 2: Business Contracts');

    const storageArt  = loadArtifact('AccountStorage');
    const storageAddr = await deployContract(signer, storageArt.abi, storageArt.bytecode, [clusterAddr]);
    console.log('  AccountStorage [id=1]:', storageAddr);

    const tradeV1Art  = loadArtifact('TradeEngineV1');
    const tradeV1Addr = await deployContract(signer, tradeV1Art.abi, tradeV1Art.bytecode, [clusterAddr]);
    console.log('  TradeEngineV1  [id=2]:', tradeV1Addr);

    const riskArt  = loadArtifact('RiskGuardV1');
    const riskAddr = await deployContract(signer, riskArt.abi, riskArt.bytecode, [clusterAddr]);
    console.log('  RiskGuardV1    [id=3]:', riskAddr, '\n');

    // ── Phase 3: 注册合约 ─────────────────────────────────────────
    console.log('>>> Phase 3: Register contracts');
    await callContract(signer, clusterAddr, CLUSTER_ABI, 'registerContract', [1, 'AccountStorage', storageAddr]);
    console.log('  [id=1] AccountStorage');
    await callContract(signer, clusterAddr, CLUSTER_ABI, 'registerContract', [2, 'TradeEngineV1',  tradeV1Addr]);
    console.log('  [id=2] TradeEngineV1');
    await callContract(signer, clusterAddr, CLUSTER_ABI, 'registerContract', [3, 'RiskGuardV1',    riskAddr]);
    console.log('  [id=3] RiskGuardV1\n');

    // ── Phase 4: Pod 连接 ─────────────────────────────────────────
    console.log('>>> Phase 4: Wire pod connections');
    await callContract(signer, clusterAddr, CLUSTER_ABI, 'addActivePodAfterMount', [tradeV1Addr, storageAddr, 1]);
    console.log('  TradeEngineV1 --active[1]--> AccountStorage');
    await callContract(signer, clusterAddr, CLUSTER_ABI, 'addActivePodAfterMount', [tradeV1Addr, riskAddr, 3]);
    console.log('  TradeEngineV1 --active[3]--> RiskGuardV1\n');

    // ── Phase 5: 冒烟测试 ─────────────────────────────────────────
    console.log('>>> Phase 5: Smoke test');

    // Hardhat 默认测试账号（本地节点 / demo 专用，勿用于生产）
    const user1 = getSigner(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        provider
    );
    const user2 = getSigner(
        '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
        provider
    );
    const user1Addr = await user1.getAddress();
    const user2Addr = await user2.getAddress();

    const TOKEN_ETH = 0;
    await callContract(user1, tradeV1Addr, TRADE_ABI, 'deposit',  [TOKEN_ETH, ethers.parseEther('1000')]);
    await callContract(user2, tradeV1Addr, TRADE_ABI, 'deposit',  [TOKEN_ETH, ethers.parseEther('500')]);
    await callContract(user1, tradeV1Addr, TRADE_ABI, 'transfer', [TOKEN_ETH, user2Addr, ethers.parseEther('200')]);

    // view 调用（只读，用 provider 即可）
    const trade = new ethers.Contract(tradeV1Addr, TRADE_ABI, provider);
    const b1 = await trade.getBalance(TOKEN_ETH, user1Addr);
    const b2 = await trade.getBalance(TOKEN_ETH, user2Addr);
    console.log('  user1 balance:', ethers.formatEther(b1), '(deposited 1000, sent 200)');
    console.log('  user2 balance:', ethers.formatEther(b2), '(deposited 500, received 200)');

    // 风控测试
    try {
        await callContract(user1, tradeV1Addr, TRADE_ABI, 'transfer',
            [TOKEN_ETH, user2Addr, ethers.parseEther('20000')]);
        console.log('  [FAIL] Risk check should have reverted');
    } catch {
        console.log('  Over-limit rejected by RiskGuard ✓');
    }

    // ── Phase 6: 保存部署结果 ─────────────────────────────────────
    config.fsca.clusterAddress  = clusterAddr;
    config.fsca.evokerManager   = evokerAddr;
    config.fsca.accountStorage  = storageAddr;
    config.fsca.tradeEngineV1   = tradeV1Addr;
    config.fsca.riskGuardV1     = riskAddr;
    saveProjectConfig(config);

    console.log('\n' + '='.repeat(60));
    console.log('Deployment complete  →  project.json updated');
    console.log('='.repeat(60));
    console.log('  clusterAddress :', clusterAddr);
    console.log('  accountStorage :', storageAddr);
    console.log('  tradeEngineV1  :', tradeV1Addr);
    console.log('  riskGuardV1    :', riskAddr);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
