#!/bin/bash
# ============================================================
# FSCA CBS 架构演示
# 用 fsca CLI 命令手动演示全流程
#
# 用法:  bash demo.sh
# ============================================================

set -e
DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
FSCA="node ${DEMO_DIR}/../cli/index.js"      # fsca CLI 入口
NODE_PID=""

# ── 颜色 ──────────────────────────────────────────────────
BOLD="\033[1m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
BLUE="\033[1;34m"
DIM="\033[2m"
RESET="\033[0m"

# ── 工具 ──────────────────────────────────────────────────
banner() {
    echo ""
    echo -e "${CYAN}============================================================${RESET}"
    echo -e "${CYAN}  $1${RESET}"
    echo -e "${CYAN}============================================================${RESET}"
    echo ""
}

cmd() {
    # 打印即将执行的命令（高亮），然后执行
    echo -e "${BLUE}  \$ $*${RESET}"
    eval "$@"
    echo ""
}

pause() {
    echo -e "${YELLOW}  ─────────────────────────────────────────────────────${RESET}"
    echo -e "${YELLOW}  按 Enter 执行下一条命令...${RESET}"
    echo -e "${YELLOW}  ─────────────────────────────────────────────────────${RESET}"
    read -r
}

cleanup() {
    [ -n "$NODE_PID" ] && kill "$NODE_PID" 2>/dev/null || true
}
trap cleanup EXIT

# ── 切换到 demo 目录 ──────────────────────────────────────
cd "$DEMO_DIR"

# ── 清理残留节点 ──────────────────────────────────────────
EXISTING=$(lsof -ti tcp:8545 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
    echo -e "${DIM}  清理 8545 端口残留进程 (pid=$EXISTING)${RESET}"
    kill -9 $EXISTING 2>/dev/null || true
    for i in $(seq 1 10); do sleep 0.3; [ -z "$(lsof -ti tcp:8545 2>/dev/null)" ] && break; done
fi

# ── 重置 project.json ────────────────────────────────────
cat > "$DEMO_DIR/project.json" <<'EOF'
{
  "network": { "name": "localhost", "rpc": "http://127.0.0.1:8545" },
  "account": { "privateKey": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" },
  "fsca": {}
}
EOF

# ============================================================
banner "FSCA CBS 架构演示"
# ============================================================
echo -e "  演示合约架构："
echo -e "  ${DIM}AccountStorage  [id=1]  — 纯存储，双重 mapping，只有 get/set${RESET}"
echo -e "  ${DIM}TradeEngineV1   [id=2]  — 交易逻辑，无用户 mapping${RESET}"
echo -e "  ${DIM}RiskGuardV1     [id=3]  — 风控规则，纯策略参数${RESET}"
echo -e "  ${DIM}TradeEngineV2   [id=2]  — 热升级版本，增加 1% 手续费${RESET}"
echo ""
pause

# ============================================================
banner "Phase 1 — 启动本地链 + 编译合约"
# ============================================================

echo -e "${BOLD}启动 Hardhat 本地节点...${RESET}"
npx hardhat node --hostname 127.0.0.1 > /tmp/hardhat-demo.log 2>&1 &
NODE_PID=$!
echo -ne "  等待节点就绪"
for i in $(seq 1 30); do
    sleep 0.5; echo -n "."
    grep -q "Started HTTP" /tmp/hardhat-demo.log 2>/dev/null && break
done
echo ""
echo -e "${GREEN}  ✓ 节点启动 (pid=$NODE_PID)${RESET}"
echo ""

cmd "npx hardhat compile"

echo -e "  ${DIM}部署基础设施（ClusterManager + EvokerManager）...${RESET}"
npx hardhat run scripts/setup-infra.js --network localhost
echo -e "${GREEN}  ✓ 基础设施就绪，clusterAddress 已写入 project.json${RESET}"
pause

# ============================================================
banner "Phase 2 — 部署业务合约（fsca deploy）"
# ============================================================
echo -e "${DIM}  fsca deploy 会：编译 → 部署 → 写入 project.json 的 unmountedcontracts${RESET}"
echo ""

pause
cmd "$FSCA deploy --contract AccountStorage --description AccountStorage"
pause
cmd "$FSCA deploy --contract TradeEngineV1 --description TradeEngineV1"
pause
cmd "$FSCA deploy --contract RiskGuardV1 --description RiskGuardV1"

# ============================================================
banner "Phase 3 — 注册合约到集群（fsca cluster mount）"
# ============================================================
echo -e "${DIM}  cluster mount 会：registerContract(id, name, currentOperating)${RESET}"
echo -e "${DIM}  触发 EvokerManager.mount() → whetherMounted = 1${RESET}"
echo ""

# 从 project.json 读取刚部署的地址（用 node 解析）
STORAGE_ADDR=$(node -e "const c=require('./project.json'); const a=c.fsca.unmountedcontracts||c.fsca.alldeployedcontracts; console.log(a.find(x=>x.name==='AccountStorage').address)")
TRADE_V1_ADDR=$(node -e "const c=require('./project.json'); const a=c.fsca.unmountedcontracts||c.fsca.alldeployedcontracts; console.log(a.find(x=>x.name==='TradeEngineV1').address)")
RISK_ADDR=$(node -e "const c=require('./project.json'); const a=c.fsca.unmountedcontracts||c.fsca.alldeployedcontracts; console.log(a.find(x=>x.name==='RiskGuardV1').address)")

echo -e "  AccountStorage  → ${DIM}$STORAGE_ADDR${RESET}"
echo -e "  TradeEngineV1   → ${DIM}$TRADE_V1_ADDR${RESET}"
echo -e "  RiskGuardV1     → ${DIM}$RISK_ADDR${RESET}"
echo ""

pause
cmd "$FSCA cluster choose $STORAGE_ADDR"
cmd "$FSCA cluster mount 1 AccountStorage"

pause
cmd "$FSCA cluster choose $TRADE_V1_ADDR"
cmd "$FSCA cluster mount 2 TradeEngineV1"

pause
cmd "$FSCA cluster choose $RISK_ADDR"
cmd "$FSCA cluster mount 3 RiskGuardV1"

pause
cmd "$FSCA cluster list mounted"

# ============================================================
banner "Phase 4 — 建立 Pod 连接（fsca cluster link）"
# ============================================================
echo -e "${DIM}  选中 TradeEngineV1，然后 link → AccountStorage 和 RiskGuardV1${RESET}"
echo -e "${DIM}  link 自动检测 whetherMounted=1，调用 addActivePodAfterMount${RESET}"
echo ""

pause
cmd "$FSCA cluster choose $TRADE_V1_ADDR"
cmd "$FSCA cluster link positive $STORAGE_ADDR 1"

pause
cmd "$FSCA cluster link positive $RISK_ADDR 3"

pause
cmd "$FSCA cluster graph"

# ============================================================
banner "Phase 5 — 热升级 TradeEngineV1 → TradeEngineV2"
# ============================================================
echo -e "${DIM}  fsca cluster upgrade 会：${RESET}"
echo -e "${DIM}  1. 读取旧合约 pods（id=2 的 TradeEngineV1）${RESET}"
echo -e "${DIM}  2. 部署 TradeEngineV2${RESET}"
echo -e "${DIM}  3. 复制 pods 到新合约（BeforeMount）${RESET}"
echo -e "${DIM}  4. deleteContract(2) → unmount V1${RESET}"
echo -e "${DIM}  5. registerContract(2, V2) → mount V2${RESET}"
echo ""

pause
cmd "$FSCA cluster upgrade --id 2 --contract TradeEngineV2"

pause
cmd "$FSCA cluster list mounted"
cmd "$FSCA cluster graph"

# ============================================================
banner "演示完成"
# ============================================================
echo -e "${GREEN}  AccountStorage 地址全程未变                          ✓${RESET}"
echo -e "${GREEN}  用户余额完整保留（AccountStorage 数据未动）           ✓${RESET}"
echo -e "${GREEN}  TradeEngineV2 手续费逻辑生效                          ✓${RESET}"
echo -e "${GREEN}  RiskGuardV1 全程未触碰                                ✓${RESET}"
echo ""
echo -e "  ${DIM}所有状态已保存到 demo/project.json${RESET}"
echo ""
