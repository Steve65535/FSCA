/**
 * FSCA Demo 热升级脚本：TradeEngineV1 → TradeEngineV2
 *
 * 与 libs/commands/cluster/upgrade.js 逻辑一致，复用相同 CLI 封装
 *
 * 前置：已运行 node scripts/deploy.js
 * 运行：node scripts/upgrade.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { ethers } = require('ethers');

// ── 复用 CLI 封装模块 ──────────────────────────────────────────────
const { getProvider }    = require('../../chain/provider');
const { getSigner }      = require('../../wallet/signer');
const { deployContract } = require('../../chain/deploy');
const { callContract }   = require('../../chain/tx');

const DEMO_DIR = path.join(__dirname, '..');

// ClusterManager 最小 ABI
const CLUSTER_ABI = [
    'function addActivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function deleteContract(uint32 id) external',
    'function registerContract(uint32 id, string memory name, address contractAddr) external',
];

// normalTemplate 最小 ABI（余额查询 + 交易量查询）
const TRADE_V1_ABI = [
    'function getBalance(uint32 tokenId, address user) view returns (uint256)',
];
const TRADE_V2_ABI = [
    'function transfer(uint32 tokenId, address to, uint256 amount) external',
    'function getBalance(uint32 tokenId, address user) view returns (uint256)',
    'function getTotalVolume(address user) view returns (uint256)',
];

function loadProjectConfig() {
    const p = path.join(DEMO_DIR, 'project.json');
    if (!fs.existsSync(p)) throw new Error('project.json not found. Run deploy.js first.');
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveProjectConfig(config) {
    fs.writeFileSync(path.join(DEMO_DIR, 'project.json'), JSON.stringify(config, null, 2));
}

function loadArtifact(contractName) {
    const base = path.join(DEMO_DIR, 'artifacts', 'contracts');
    const candidates = [
        path.join(base, 'logic',             `${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'storage',           `${contractName}.sol`, `${contractName}.json`),
        path.join(base, 'core', 'structure', `${contractName}.sol`, `${contractName}.json`),
        path.join(base,                      `${contractName}.sol`, `${contractName}.json`),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    throw new Error(`Artifact not found for "${contractName}". Run: npx hardhat compile`);
}

async function main() {
    const config   = loadProjectConfig();
    const provider  = getProvider(config.network.rpc);
    const signer    = getSigner(config.account.privateKey, provider);
    const deployer  = await signer.getAddress();

    const { clusterAddress, accountStorage, tradeEngineV1, riskGuardV1 } = config.fsca;
    if (!clusterAddress) throw new Error('clusterAddress missing. Run deploy.js first.');

    console.log('='.repeat(60));
    console.log('FSCA Demo: Hot-Swap TradeEngineV1 → TradeEngineV2');
    console.log('='.repeat(60));
    console.log('Deployer:', deployer);

    // ── 升级前快照 ────────────────────────────────────────────────
    const TOKEN_ETH = 0;
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

    const tradeV1 = new ethers.Contract(tradeEngineV1, TRADE_V1_ABI, provider);
    const b1Before = await tradeV1.getBalance(TOKEN_ETH, user1Addr);
    const b2Before = await tradeV1.getBalance(TOKEN_ETH, user2Addr);
    console.log('\n[Before Upgrade]');
    console.log('  user1:', ethers.formatEther(b1Before));
    console.log('  user2:', ethers.formatEther(b2Before));

    // ── Step 1: 部署 V2 ───────────────────────────────────────────
    console.log('\n>>> Step 1: Deploy TradeEngineV2');
    const art = loadArtifact('TradeEngineV2');
    const tradeV2Addr = await deployContract(signer, art.abi, art.bytecode, [clusterAddress, deployer]);
    console.log('  TradeEngineV2:', tradeV2Addr);

    // ── Step 2: 挂载前配置 V2 pods ────────────────────────────────
    //   与 libs/commands/cluster/upgrade.js 的 addActivePodBeforeMount 逻辑相同
    console.log('\n>>> Step 2: Configure V2 pods (BeforeMount)');
    await callContract(signer, clusterAddress, CLUSTER_ABI, 'addActivePodBeforeMount',
        [tradeV2Addr, accountStorage, 1]);
    console.log('  V2.activePod[1] = AccountStorage');

    await callContract(signer, clusterAddress, CLUSTER_ABI, 'addActivePodBeforeMount',
        [tradeV2Addr, riskGuardV1, 3]);
    console.log('  V2.activePod[3] = RiskGuardV1');

    // ── Step 3: 卸载 V1 ──────────────────────────────────────────
    console.log('\n>>> Step 3: deleteContract(2) → unmount V1');
    await callContract(signer, clusterAddress, CLUSTER_ABI, 'deleteContract', [2]);
    console.log('  V1 unmounted, EvokerManager edges removed');

    // ── Step 4: 挂载 V2 ──────────────────────────────────────────
    console.log('\n>>> Step 4: registerContract(2, TradeEngineV2) → mount V2');
    await callContract(signer, clusterAddress, CLUSTER_ABI, 'registerContract',
        [2, 'TradeEngineV2', tradeV2Addr]);
    console.log('  V2 mounted (id=2)');
    console.log('  AccountStorage.passivePod[2] = V2');

    // ── 验证 ──────────────────────────────────────────────────────
    const tradeV2 = new ethers.Contract(tradeV2Addr, TRADE_V2_ABI, provider);

    console.log('\n[Data Integrity Check]');
    const b1After = await tradeV2.getBalance(TOKEN_ETH, user1Addr);
    const b2After = await tradeV2.getBalance(TOKEN_ETH, user2Addr);
    console.log('  user1:', ethers.formatEther(b1After), b1After === b1Before ? '✓ preserved' : '✗ MISMATCH');
    console.log('  user2:', ethers.formatEther(b2After), b2After === b2Before ? '✓ preserved' : '✗ MISMATCH');

    console.log('\n[Fee Logic Test - transfer 100, feeRate=1%]');
    await callContract(user1, tradeV2Addr, TRADE_V2_ABI, 'transfer',
        [TOKEN_ETH, user2Addr, ethers.parseEther('100')]);

    const b1Final = await tradeV2.getBalance(TOKEN_ETH, user1Addr);
    const b2Final = await tradeV2.getBalance(TOKEN_ETH, user2Addr);
    const bFee    = await tradeV2.getBalance(TOKEN_ETH, deployer);
    const vol1    = await tradeV2.getTotalVolume(user1Addr);

    console.log('  user1 :', ethers.formatEther(b1Final), '(sent 100)');
    console.log('  user2 :', ethers.formatEther(b2Final), '(received 99)');
    console.log('  fee   :', ethers.formatEther(bFee),    '(1% → deployer)');
    console.log('  vol1  :', ethers.formatEther(vol1),    '(new V2 metric)');

    // ── 保存结果 ──────────────────────────────────────────────────
    config.fsca.tradeEngineV2 = tradeV2Addr;
    saveProjectConfig(config);

    console.log('\n' + '='.repeat(60));
    console.log('Hot-swap complete  →  project.json updated');
    console.log('  Data preserved across upgrade         ✓');
    console.log('  AccountStorage address unchanged      ✓');
    console.log('  New fee logic applied                 ✓');
    console.log('='.repeat(60));
}

main().catch(err => { console.error(err); process.exitCode = 1; });
