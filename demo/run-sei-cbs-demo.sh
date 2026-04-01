#!/usr/bin/env bash
set -euo pipefail

# Arkheion CBS demo on Sei testnet:
# init -> cluster init -> deploy -> link -> mount -> upgrade
#
# Requirements:
# - `arkheion` must be installed via npm link / global install
# - Provide account credentials via env vars:
#   - Arkheion_PRIVATE_KEY
#   - Arkheion_ACCOUNT_ADDRESS
#
# Optional env vars:
# - SEI_TESTNET_RPC (default: https://evm-rpc-testnet.sei-apis.com)
# - Arkheion_WORKDIR (default: ./arkheion-demo-sei-testnet)
# - CLUSTER_THRESHOLD (default: 1)

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_CONTRACTS_DIR="${ROOT_DIR}/demo/contracts"

NETWORK_NAME="sei-testnet"
RPC_URL="${SEI_TESTNET_RPC:-https://evm-rpc-testnet.sei-apis.com}"
CHAIN_ID="1328"
BLOCK_CONFIRMATIONS="1"
THRESHOLD="${CLUSTER_THRESHOLD:-1}"
WORKDIR="${Arkheion_WORKDIR:-${ROOT_DIR}/arkheion-demo-sei-testnet}"

if ! command -v arkheion >/dev/null 2>&1; then
  echo "ERROR: 'arkheion' command not found. Please run npm link first."
  exit 1
fi

if [ ! -d "${SRC_CONTRACTS_DIR}" ]; then
  echo "ERROR: source contracts not found: ${SRC_CONTRACTS_DIR}"
  exit 1
fi

if [ -z "${Arkheion_PRIVATE_KEY:-}" ] || [ -z "${Arkheion_ACCOUNT_ADDRESS:-}" ]; then
  echo "ERROR: missing env vars."
  echo "Please export:"
  echo "  Arkheion_PRIVATE_KEY=<your-sei-testnet-private-key>"
  echo "  Arkheion_ACCOUNT_ADDRESS=<your-sei-testnet-address>"
  exit 1
fi

print_banner() {
  printf "\n============================================================\n"
  printf "%s\n" "$1"
  printf "============================================================\n\n"
}

run_cli() {
  printf "\n$ %s\n" "$*"
  "$@"
}

get_registry_addr_by_id() {
  local id="$1"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const { ethers } = require('ethers');
    (async () => {
      const root = process.cwd();
      const cfg = JSON.parse(fs.readFileSync(path.join(root, 'project.json'), 'utf8'));
      const provider = new ethers.JsonRpcProvider(cfg.network.rpc);
      const abiCandidates = [
        path.join(root, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
        path.join(root, 'artifacts', 'contracts', 'core', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
        path.join(root, 'artifacts', 'contracts', 'structure', 'clustermanager.sol', 'ClusterManager.json')
      ];
      let abi = null;
      for (const p of abiCandidates) {
        if (fs.existsSync(p)) {
          abi = JSON.parse(fs.readFileSync(p, 'utf8')).abi;
          break;
        }
      }
      if (!abi) {
        throw new Error('ClusterManager ABI not found');
      }
      const cluster = new ethers.Contract(cfg.arkheion.clusterAddress, abi, provider);
      const r = await cluster.getById(Number(process.argv[1]));
      console.log(r.contractAddr);
    })().catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
  " "$id"
}

print_banner "Arkheion CBS Demo (Sei Testnet) - START"
echo "Network Name: ${NETWORK_NAME}"
echo "RPC URL:      ${RPC_URL}"
echo "Chain ID:     ${CHAIN_ID}"
echo "Workdir:      ${WORKDIR}"
echo ""

print_banner "Prepare Workspace"
rm -rf "${WORKDIR}"
mkdir -p "${WORKDIR}"
cp -R "${SRC_CONTRACTS_DIR}" "${WORKDIR}/contracts"
cd "${WORKDIR}"

print_banner "Step 1 - arkheion init (Sei testnet params)"
run_cli arkheion init \
  --networkName "${NETWORK_NAME}" \
  --rpc "${RPC_URL}" \
  --chainId "${CHAIN_ID}" \
  --blockConfirmations "${BLOCK_CONFIRMATIONS}" \
  --accountPrivateKey "${Arkheion_PRIVATE_KEY}" \
  --address "${Arkheion_ACCOUNT_ADDRESS}"

print_banner "Step 2 - arkheion cluster init"
run_cli arkheion cluster init --threshold "${THRESHOLD}"

print_banner "Step 3 - arkheion deploy CBS contracts"
run_cli arkheion deploy --contract AccountStorage --description AccountStorage
run_cli arkheion deploy --contract TradeEngineV1 --description TradeEngineV1
run_cli arkheion deploy --contract RiskGuardV1 --description RiskGuardV1

STORAGE_ADDR="$(node -e "const c=require('./project.json');console.log(c.arkheion.alldeployedcontracts.find(x=>x.name==='AccountStorage').address)")"
TRADE_V1_ADDR="$(node -e "const c=require('./project.json');console.log(c.arkheion.alldeployedcontracts.find(x=>x.name==='TradeEngineV1').address)")"
RISK_ADDR="$(node -e "const c=require('./project.json');console.log(c.arkheion.alldeployedcontracts.find(x=>x.name==='RiskGuardV1').address)")"

echo ""
echo "Resolved contract addresses:"
echo "  AccountStorage: ${STORAGE_ADDR}"
echo "  TradeEngineV1:  ${TRADE_V1_ADDR}"
echo "  RiskGuardV1:    ${RISK_ADDR}"

print_banner "Step 4 - arkheion cluster link (before mount)"
run_cli arkheion cluster choose "${TRADE_V1_ADDR}"
run_cli arkheion cluster link positive "${STORAGE_ADDR}" 1
run_cli arkheion cluster link positive "${RISK_ADDR}" 3

print_banner "Step 5 - arkheion cluster mount"
run_cli arkheion cluster choose "${STORAGE_ADDR}"
run_cli arkheion cluster mount 1 AccountStorage

run_cli arkheion cluster choose "${TRADE_V1_ADDR}"
run_cli arkheion cluster mount 2 TradeEngineV1

run_cli arkheion cluster choose "${RISK_ADDR}"
run_cli arkheion cluster mount 3 RiskGuardV1

run_cli arkheion cluster list mounted
run_cli arkheion cluster graph

print_banner "Step 6 - Hot upgrade: TradeEngineV1 -> TradeEngineV2"
BEFORE_ADDR="$(get_registry_addr_by_id 2)"
echo "Registry ID=2 before upgrade: ${BEFORE_ADDR}"

run_cli arkheion cluster upgrade --id 2 --contract TradeEngineV2

AFTER_ADDR="$(get_registry_addr_by_id 2)"
echo "Registry ID=2 after upgrade:  ${AFTER_ADDR}"

if [ "${BEFORE_ADDR}" != "${AFTER_ADDR}" ]; then
  echo "HOT UPGRADE VERIFIED: ID=2 address changed."
else
  echo "WARNING: ID=2 address did not change."
fi

run_cli arkheion cluster list mounted
run_cli arkheion cluster graph

print_banner "Arkheion CBS Demo (Sei Testnet) - DONE"
echo "Project directory: ${WORKDIR}"
echo "You can inspect status in: ${WORKDIR}/project.json"
