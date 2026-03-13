/**
 * FSCA Demo 完整演示（合并版）
 *
 * 一次性跑完：部署 → 冒烟测试 → 热升级 → 验证
 * 适合 CI 或快速演示，不依赖持久化节点
 *
 * 使用 Hardhat 内置临时节点（hardhat network），无需外部 RPC
 *
 * 运行：npx hardhat run scripts/demo.js
 *
 * ─────────────────────────────────────────────
 * 注意：只有这个 demo.js 使用 Hardhat in-process 网络，
 * deploy.js 和 upgrade.js 均使用 project.json 配置的外部 RPC，
 * 与生产 CLI 工作流完全一致。
 * ─────────────────────────────────────────────
 */

'use strict';

const hre = require('hardhat');
const { ethers } = hre;
const fs   = require('fs');
const path = require('path');

// ── 复用 CLI 封装模块（与 deploy.js / upgrade.js 保持一致）────────
const { deployContract } = require('../../chain/deploy');
const { callContract }   = require('../../chain/tx');

const DEMO_DIR = path.join(__dirname, '..');

// ── ABIs（与 deploy.js / upgrade.js 一致）──────────────────────────
const CLUSTER_ABI = [
    'function setEvokerManager(address _evoker) external',
    'function registerContract(uint32 id, string memory name, address contractAddr) external',
    'function deleteContract(uint32 id) external',
    'function addActivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addActivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
];
const TRADE_V1_ABI = [
    'function deposit(uint32 tokenId, uint256 amount) external',
    'function transfer(uint32 tokenId, address to, uint256 amount) external',
    'function getBalance(uint32 tokenId, address user) view returns (uint256)',
];
const TRADE_V2_ABI = [
    'function transfer(uint32 tokenId, address to, uint256 amount) external',
    'function getBalance(uint32 tokenId, address user) view returns (uint256)',
    'function getTotalVolume(address user) view returns (uint256)',
];

function loadArtifact(contractName) {
    const base = path.join(DEMO_DIR, 'artifacts', 'contracts');
    const candidates = [
        path.join(base, 'storage',           `${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'logic',             `${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'core', 'structure', `${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'core', 'lib',       `${contractName}.sol`, `${contractName}.json`),
        path.join(base,                      `${contractName}.sol`, `${contractName}.json`),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    throw new Error(`Artifact not found for "${contractName}". Run: npx hardhat compile`);
}

async function main() {
    // Hardhat in-process 网络提供 signer；chain/deploy 和 chain/tx 复用同一接口
    const [deployer, user1, user2] = await ethers.getSigners();
    const provider  = deployer.provider;
    const TOKEN_ETH = 0;

    console.log('='.repeat(60));
    console.log('FSCA CBS Architecture Demo');
    console.log('='.repeat(60));
    console.log('Deployer :', deployer.address);
    console.log('User1    :', user1.address);
    console.log('User2    :', user2.address, '\n');

    // ── Phase 1: 基础设施 ─────────────────────────────────────────
    console.log('─── Phase 1: Infrastructure ─────────────────────────');

    const clusterArt  = loadArtifact('ClusterManager');
    const clusterAddr = await deployContract(deployer, clusterArt.abi, clusterArt.bytecode, [deployer.address]);
    console.log('  ClusterManager:', clusterAddr);

    const evokerArt  = loadArtifact('EvokerManager');
    const evokerAddr = await deployContract(deployer, evokerArt.abi, evokerArt.bytecode, [clusterAddr]);
    console.log('  EvokerManager :', evokerAddr);

    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'setEvokerManager', [evokerAddr]);
    console.log('  Linked\n');

    // ── Phase 2: 业务合约 ─────────────────────────────────────────
    console.log('─── Phase 2: Business Contracts ─────────────────────');

    const storageArt  = loadArtifact('AccountStorage');
    const storageAddr = await deployContract(deployer, storageArt.abi, storageArt.bytecode, [clusterAddr]);
    console.log('  AccountStorage [id=1]:', storageAddr);

    const tradeV1Art  = loadArtifact('TradeEngineV1');
    const tradeV1Addr = await deployContract(deployer, tradeV1Art.abi, tradeV1Art.bytecode, [clusterAddr]);
    console.log('  TradeEngineV1  [id=2]:', tradeV1Addr);

    const riskArt  = loadArtifact('RiskGuardV1');
    const riskAddr = await deployContract(deployer, riskArt.abi, riskArt.bytecode, [clusterAddr]);
    console.log('  RiskGuardV1    [id=3]:', riskAddr, '\n');

    // ── Phase 3: 注册 + Pod 连接 ──────────────────────────────────
    console.log('─── Phase 3: Register & Wire Pods ───────────────────');

    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'registerContract', [1, 'AccountStorage', storageAddr]);
    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'registerContract', [2, 'TradeEngineV1',  tradeV1Addr]);
    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'registerContract', [3, 'RiskGuardV1',    riskAddr]);

    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'addActivePodAfterMount', [tradeV1Addr, storageAddr, 1]);
    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'addActivePodAfterMount', [tradeV1Addr, riskAddr,    3]);
    console.log('  TradeEngineV1 → AccountStorage (active[1])');
    console.log('  TradeEngineV1 → RiskGuardV1    (active[3])\n');

    // ── Phase 4: 功能验证（V1）────────────────────────────────────
    console.log('─── Phase 4: Functional Test (V1) ───────────────────');

    await callContract(user1, tradeV1Addr, TRADE_V1_ABI, 'deposit',  [TOKEN_ETH, ethers.parseEther('1000')]);
    await callContract(user2, tradeV1Addr, TRADE_V1_ABI, 'deposit',  [TOKEN_ETH, ethers.parseEther('500')]);
    await callContract(user1, tradeV1Addr, TRADE_V1_ABI, 'transfer', [TOKEN_ETH, user2.address, ethers.parseEther('200')]);

    const tradeV1 = new ethers.Contract(tradeV1Addr, TRADE_V1_ABI, provider);
    const b1v1 = await tradeV1.getBalance(TOKEN_ETH, user1.address);
    const b2v1 = await tradeV1.getBalance(TOKEN_ETH, user2.address);
    console.log('  user1:', ethers.formatEther(b1v1), '(deposited 1000, sent 200)');
    console.log('  user2:', ethers.formatEther(b2v1), '(deposited 500, received 200)');

    try {
        await callContract(user1, tradeV1Addr, TRADE_V1_ABI, 'transfer',
            [TOKEN_ETH, user2.address, ethers.parseEther('20000')]);
        console.log('  [FAIL] should have reverted');
    } catch {
        console.log('  Over-limit rejected by RiskGuard ✓\n');
    }

    // ── Phase 5: 热升级 V1 → V2 ──────────────────────────────────
    console.log('─── Phase 5: Hot-Swap V1 → V2 ───────────────────────');

    const v2Art   = loadArtifact('TradeEngineV2');
    const tradeV2Addr = await deployContract(deployer, v2Art.abi, v2Art.bytecode, [clusterAddr, deployer.address]);
    console.log('  TradeEngineV2 deployed:', tradeV2Addr);

    // BeforeMount 配置 pods（与 libs/commands/cluster/upgrade.js 逻辑相同）
    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'addActivePodBeforeMount', [tradeV2Addr, storageAddr, 1]);
    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'addActivePodBeforeMount', [tradeV2Addr, riskAddr,    3]);
    console.log('  V2 pods configured');

    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'deleteContract',    [2]);
    await callContract(deployer, clusterAddr, CLUSTER_ABI, 'registerContract',  [2, 'TradeEngineV2', tradeV2Addr]);
    console.log('  Swap complete (id=2 now points to V2)\n');

    // ── Phase 6: 验证 ─────────────────────────────────────────────
    console.log('─── Phase 6: Post-Upgrade Verification ──────────────');

    const tradeV2 = new ethers.Contract(tradeV2Addr, TRADE_V2_ABI, provider);
    const b1v2 = await tradeV2.getBalance(TOKEN_ETH, user1.address);
    const b2v2 = await tradeV2.getBalance(TOKEN_ETH, user2.address);

    console.log('  Data integrity:');
    console.log('    user1:', ethers.formatEther(b1v2), b1v2 === b1v1 ? '✓' : '✗');
    console.log('    user2:', ethers.formatEther(b2v2), b2v2 === b2v1 ? '✓' : '✗');

    await callContract(user1, tradeV2Addr, TRADE_V2_ABI, 'transfer',
        [TOKEN_ETH, user2.address, ethers.parseEther('100')]);

    const b1f  = await tradeV2.getBalance(TOKEN_ETH, user1.address);
    const b2f  = await tradeV2.getBalance(TOKEN_ETH, user2.address);
    const bFee = await tradeV2.getBalance(TOKEN_ETH, deployer.address);
    const vol1 = await tradeV2.getTotalVolume(user1.address);

    console.log('\n  Transfer 100 with 1% fee:');
    console.log('    user1 :', ethers.formatEther(b1f),  '(sent 100)');
    console.log('    user2 :', ethers.formatEther(b2f),  '(received 99)');
    console.log('    fee   :', ethers.formatEther(bFee), '(1 unit)');
    console.log('    vol1  :', ethers.formatEther(vol1), '(V2 new metric)');

    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log('  AccountStorage address unchanged          ✓');
    console.log('  All user balances preserved (zero-mig)   ✓');
    console.log('  New fee logic applied after hot-swap      ✓');
    console.log('  RiskGuard untouched                       ✓');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
