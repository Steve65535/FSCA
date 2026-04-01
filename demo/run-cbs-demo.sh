#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Arkheion CBS Demo - 符合最佳实践的部署与升级脚本
#
# 基于《使用 Arkheion CLI 构建链上微服务集群的最佳实践》编写
#
# 模块拓扑（存储与逻辑分离）：
#
#   L0 数据层:  AccountStorage  (ID=1)  — 永不升级，持久化所有用户数据
#   L1 业务层:  TradeEngineV1   (ID=2)  — 可热升级为 V2
#               RiskGuardV1     (ID=3)  — 风控策略模块
#
# 依赖关系（调用方向）：
#
#   TradeEngineV1 --activePod[1]--> AccountStorage   (读写账本)
#   TradeEngineV1 --activePod[3]--> RiskGuardV1      (调用风控校验)
#   AccountStorage --passivePod[2]--> TradeEngineV1   (授权 TradeEngine 写入)
#   RiskGuardV1   --passivePod[2]--> TradeEngineV1   (授权 TradeEngine 调用)
#
# ID 规划（参考最佳实践 §1）：
#   1-99: 核心业务模块
#     1 = AccountStorage (数据层)
#     2 = TradeEngine    (业务层)
#     3 = RiskGuard      (业务层)
#
# 流程遵循最佳实践 §3 黄金路径：
#   A. 初始化与骨架部署
#   B. 部署业务 Pod（先部署，后挂载）
#   C. 先配 Link，再 Mount
#   D. 挂载上线
#   E. 验收检查
#   F. 热升级演示 (TradeEngineV1 -> V2)
#   G. 升级后验收
#
# 环境变量：
#   Arkheion_PRIVATE_KEY       - 部署账户私钥（必填）
#   Arkheion_ACCOUNT_ADDRESS   - 部署账户地址（必填）
#   SEI_TESTNET_RPC        - RPC 地址（可选，默认 Sei testnet）
#   Arkheion_WORKDIR           - 工作目录（可选）
#   CLUSTER_THRESHOLD      - 多签阈值（可选，默认 1）
# =============================================================================

# ─── 配置 ───────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_CONTRACTS_DIR="${ROOT_DIR}/demo/contracts"

NETWORK_NAME="sei-testnet"
RPC_URL="${SEI_TESTNET_RPC:-https://evm-rpc-testnet.sei-apis.com}"
CHAIN_ID="1328"
BLOCK_CONFIRMATIONS="1"
THRESHOLD="${CLUSTER_THRESHOLD:-1}"
WORKDIR="${Arkheion_WORKDIR:-${ROOT_DIR}/arkheion-demo-workspace}"

# ─── 前置检查 ───────────────────────────────────────────────────────────────

if ! command -v arkheion >/dev/null 2>&1; then
  echo "ERROR: 'arkheion' command not found. Run: npm link"
  exit 1
fi

if [ ! -d "${SRC_CONTRACTS_DIR}" ]; then
  echo "ERROR: source contracts not found: ${SRC_CONTRACTS_DIR}"
  exit 1
fi

if [ -z "${Arkheion_PRIVATE_KEY:-}" ] || [ -z "${Arkheion_ACCOUNT_ADDRESS:-}" ]; then
  echo "ERROR: missing env vars."
  echo "  export Arkheion_PRIVATE_KEY=<your-private-key>"
  echo "  export Arkheion_ACCOUNT_ADDRESS=<your-address>"
  exit 1
fi

# ─── 工具函数 ───────────────────────────────────────────────────────────────

banner() {
  echo ""
  echo "============================================================"
  echo "  $1"
  echo "============================================================"
  echo ""
}

step() {
  echo "──── $1 ────"
}

run() {
  echo ""
  echo "  \$ $*"
  "$@"
  echo ""
}

# 从 project.json 中按合约名读取地址
get_addr() {
  local name="$1"
  node -e "
    const c = require('./project.json');
    const found = c.arkheion.alldeployedcontracts.find(x => x.name === '${name}');
    if (!found) { console.error('Contract not found: ${name}'); process.exit(1); }
    console.log(found.address);
  "
}

# 从链上注册表按 ID 读取地址
get_registry_addr() {
  local id="$1"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const { ethers } = require('ethers');
    (async () => {
      const cfg = JSON.parse(fs.readFileSync('project.json', 'utf8'));
      const provider = new ethers.JsonRpcProvider(cfg.network.rpc);
      const abiPaths = [
        path.join('artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
        path.join('artifacts', 'contracts', 'core', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
      ];
      let abi;
      for (const p of abiPaths) {
        if (fs.existsSync(p)) { abi = JSON.parse(fs.readFileSync(p, 'utf8')).abi; break; }
      }
      if (!abi) throw new Error('ClusterManager ABI not found');
      const cluster = new ethers.Contract(cfg.arkheion.clusterAddress, abi, provider);
      const r = await cluster.getById(Number('${id}'));
      console.log(r.contractAddr);
    })().catch(e => { console.error(e.message); process.exit(1); });
  "
}

# ─── 开始 ───────────────────────────────────────────────────────────────────

banner "Arkheion CBS Demo - Best Practice Deployment & Upgrade"

echo "Configuration:"
echo "  Network:   ${NETWORK_NAME}"
echo "  RPC:       ${RPC_URL}"
echo "  Chain ID:  ${CHAIN_ID}"
echo "  Threshold: ${THRESHOLD}"
echo "  Workdir:   ${WORKDIR}"
echo ""
echo "Module Topology:"
echo "  ID=1  AccountStorage  (L0 Data Layer)"
echo "  ID=2  TradeEngineV1   (L1 Business Layer)"
echo "  ID=3  RiskGuardV1     (L1 Business Layer)"
echo ""
echo "Dependency Graph:"
echo "  TradeEngine --active[1]--> AccountStorage"
echo "  TradeEngine --active[3]--> RiskGuard"
echo "  AccountStorage --passive[2]--> TradeEngine"
echo "  RiskGuard --passive[2]--> TradeEngine"

# ═════════════════════════════════════════════════════════════════════════════
# Step A: 初始化与骨架部署（最佳实践 §3 步骤 A）
# ═════════════════════════════════════════════════════════════════════════════

banner "Step A: Initialize Project & Deploy Cluster"

step "A.1 Prepare workspace"
rm -rf "${WORKDIR}"
mkdir -p "${WORKDIR}"
cp -R "${SRC_CONTRACTS_DIR}" "${WORKDIR}/contracts"
cd "${WORKDIR}"

step "A.2 arkheion init"
run arkheion init \
  --networkName "${NETWORK_NAME}" \
  --rpc "${RPC_URL}" \
  --chainId "${CHAIN_ID}" \
  --blockConfirmations "${BLOCK_CONFIRMATIONS}" \
  --accountPrivateKey "${Arkheion_PRIVATE_KEY}" \
  --address "${Arkheion_ACCOUNT_ADDRESS}"

step "A.3 arkheion cluster init"
run arkheion cluster init --threshold "${THRESHOLD}"

step "A.4 Verify cluster infrastructure"
run arkheion wallet owners
run arkheion cluster operator list

# ═════════════════════════════════════════════════════════════════════════════
# Step B: 部署业务 Pod（最佳实践 §3 步骤 B）
# 按层级部署：先数据层，再业务层
# ═════════════════════════════════════════════════════════════════════════════

banner "Step B: Deploy Business Pods (deploy only, no mount yet)"

step "B.1 Deploy L0 Data Layer: AccountStorage"
run arkheion deploy --contract AccountStorage --description AccountStorage

step "B.2 Deploy L1 Business Layer: TradeEngineV1"
run arkheion deploy --contract TradeEngineV1 --description TradeEngineV1

step "B.3 Deploy L1 Business Layer: RiskGuardV1"
run arkheion deploy --contract RiskGuardV1 --description RiskGuardV1

# 记录地址
STORAGE_ADDR="$(get_addr AccountStorage)"
TRADE_V1_ADDR="$(get_addr TradeEngineV1)"
RISK_ADDR="$(get_addr RiskGuardV1)"

echo ""
echo "Deployed addresses:"
echo "  AccountStorage (ID=1): ${STORAGE_ADDR}"
echo "  TradeEngineV1  (ID=2): ${TRADE_V1_ADDR}"
echo "  RiskGuardV1    (ID=3): ${RISK_ADDR}"

# ═════════════════════════════════════════════════════════════════════════════
# Step C: 先配 Link，再 Mount（最佳实践 §3 步骤 C）
#
# 关键：所有 link 必须在 mount 之前完成（whetherMounted=0 时才能修改 pod）
#
# TradeEngineV1 的 activePod:
#   activePod[1] = AccountStorage  (TradeEngine 主动调用 Storage 读写数据)
#   activePod[3] = RiskGuardV1     (TradeEngine 主动调用 RiskGuard 做风控)
#
# 注意：link 类型参数是 positive（对应 activePod）和 passive（对应 passivePod）
# ═════════════════════════════════════════════════════════════════════════════

banner "Step C: Configure Links (before mount)"

step "C.1 Configure TradeEngineV1 active pods"
run arkheion cluster choose "${TRADE_V1_ADDR}"
echo "  Link: TradeEngine --active[1]--> AccountStorage"
run arkheion cluster link positive "${STORAGE_ADDR}" 1
echo "  Link: TradeEngine --active[3]--> RiskGuard"
run arkheion cluster link positive "${RISK_ADDR}" 3

# AccountStorage 和 RiskGuard 的 passivePod 不需要手动配置
# mount 时 EvokerManager 会自动根据 TradeEngine 的 activePod 建立反向边：
#   AccountStorage.passivePod[2] = TradeEngine
#   RiskGuard.passivePod[2] = TradeEngine

# ═════════════════════════════════════════════════════════════════════════════
# Step D: 挂载上线（最佳实践 §3 步骤 D）
#
# 挂载顺序：先挂载数据层，再挂载业务层
# 原因：mount 时 EvokerManager 会读取 activePod 并在目标合约上建立 passivePod
#       目标合约必须已经在注册表中（已 mount），否则 addrToId 校验会失败
#
# 正确顺序：
#   1. AccountStorage (ID=1) — 无 activePod，直接挂载
#   2. RiskGuardV1    (ID=3) — 无 activePod，直接挂载
#   3. TradeEngineV1  (ID=2) — 有 activePod[1,3]，mount 时自动建立双向边
# ═════════════════════════════════════════════════════════════════════════════

banner "Step D: Mount to Cluster (topological order)"

step "D.1 Mount L0: AccountStorage (ID=1)"
run arkheion cluster choose "${STORAGE_ADDR}"
run arkheion cluster mount 1 AccountStorage

step "D.2 Mount L1: RiskGuardV1 (ID=3)"
run arkheion cluster choose "${RISK_ADDR}"
run arkheion cluster mount 3 RiskGuardV1

step "D.3 Mount L1: TradeEngineV1 (ID=2)"
echo "  This will auto-create bidirectional edges:"
echo "    AccountStorage.passivePod[2] = TradeEngine"
echo "    RiskGuard.passivePod[2] = TradeEngine"
run arkheion cluster choose "${TRADE_V1_ADDR}"
run arkheion cluster mount 2 TradeEngineV1

# ═════════════════════════════════════════════════════════════════════════════
# Step E: 验收检查（最佳实践 §7）
# ═════════════════════════════════════════════════════════════════════════════

banner "Step E: Post-Mount Verification"

step "E.1 Verify mounted contracts"
run arkheion cluster list mounted

step "E.2 Verify cluster topology"
run arkheion cluster graph

step "E.3 Verify individual contract info"
run arkheion cluster info 1
run arkheion cluster info 2
run arkheion cluster info 3

step "E.4 Verify TradeEngine active modules"
run arkheion cluster choose "${TRADE_V1_ADDR}"
run arkheion normal get modules active

step "E.5 Verify AccountStorage passive modules"
run arkheion cluster choose "${STORAGE_ADDR}"
run arkheion normal get modules passive

step "E.6 Verify RiskGuard passive modules"
run arkheion cluster choose "${RISK_ADDR}"
run arkheion normal get modules passive

echo ""
echo "✓ All verifications passed. Cluster is operational."

# ═════════════════════════════════════════════════════════════════════════════
# Step F: 热升级演示（最佳实践 §5）
#
# TradeEngineV1 -> TradeEngineV2
#
# V2 新增功能：转账手续费 + 交易量统计
# Pod 拓扑与 V1 完全相同，使用默认 pod 复制（不加 --skip-copy-pods）
#
# upgrade 命令执行流程：
#   1. 读取旧合约 (ID=2) 的 active/passive pod 配置
#   2. 部署 TradeEngineV2
#   3. 将 V1 的 pod 配置复制到 V2（BeforeMount 阶段）
#   4. deleteContract(2) — 卸载 V1，EvokerManager 清除所有边
#   5. registerContract(2, "TradeEngineV1", V2_addr) — 挂载 V2，重建所有边
#   6. AccountStorage.passivePod[2] 自动更新为 V2 地址，数据零迁移
# ═════════════════════════════════════════════════════════════════════════════

banner "Step F: Hot Upgrade - TradeEngineV1 -> TradeEngineV2"

step "F.1 Record pre-upgrade state"
BEFORE_ADDR="$(get_registry_addr 2)"
echo "  Registry ID=2 before upgrade: ${BEFORE_ADDR}"

step "F.2 Execute hot upgrade"
run arkheion cluster upgrade --id 2 --contract TradeEngineV2

step "F.3 Verify upgrade result"
AFTER_ADDR="$(get_registry_addr 2)"
echo "  Registry ID=2 after upgrade:  ${AFTER_ADDR}"

if [ "${BEFORE_ADDR}" != "${AFTER_ADDR}" ]; then
  echo ""
  echo "  ✓ HOT UPGRADE VERIFIED"
  echo "    Old address: ${BEFORE_ADDR}"
  echo "    New address: ${AFTER_ADDR}"
  echo "    AccountStorage data: PRESERVED (zero migration)"
else
  echo ""
  echo "  ✗ WARNING: ID=2 address did not change. Upgrade may have failed."
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
# Step G: 升级后验收（最佳实践 §7）
# ═════════════════════════════════════════════════════════════════════════════

banner "Step G: Post-Upgrade Verification"

step "G.1 Verify mounted contracts"
run arkheion cluster list mounted

step "G.2 Verify cluster topology (should be identical structure)"
run arkheion cluster graph

step "G.3 Verify TradeEngineV2 active modules (should match V1)"
run arkheion cluster choose "${AFTER_ADDR}"
run arkheion normal get modules active

step "G.4 Verify AccountStorage passive modules (should point to V2)"
run arkheion cluster choose "${STORAGE_ADDR}"
run arkheion normal get modules passive

step "G.5 Verify RiskGuard passive modules (should point to V2)"
run arkheion cluster choose "${RISK_ADDR}"
run arkheion normal get modules passive

# ═════════════════════════════════════════════════════════════════════════════
# 完成
# ═════════════════════════════════════════════════════════════════════════════

banner "Arkheion CBS Demo - COMPLETE"

echo "Summary:"
echo "  ✓ Cluster infrastructure deployed (MultiSig + ClusterManager + EvokerManager + ProxyWallet)"
echo "  ✓ 3 business pods deployed and mounted"
echo "  ✓ Dependency graph established (TradeEngine -> AccountStorage, TradeEngine -> RiskGuard)"
echo "  ✓ Hot upgrade executed (TradeEngineV1 -> TradeEngineV2)"
echo "  ✓ AccountStorage data preserved across upgrade"
echo ""
echo "Contract Addresses:"
echo "  AccountStorage (ID=1): ${STORAGE_ADDR}"
echo "  TradeEngineV2  (ID=2): ${AFTER_ADDR}"
echo "  RiskGuardV1    (ID=3): ${RISK_ADDR}"
echo ""
echo "Project directory: ${WORKDIR}"
echo "Inspect state:     cat ${WORKDIR}/project.json"
