# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FSCA CLI is a command-line tool for managing on-chain smart contract clusters. It enables deploying, mounting, linking, and hot-swapping contracts in a managed cluster architecture with multi-signature governance.

## Build and Test Commands

```bash
# Compile contracts (Hardhat)
npx hardhat compile

# Run tests
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only

# Run CLI locally
node cli/index.js <command>
```

## High-Level Architecture

### 1. CLI Layer (cli/)

- **parser.js**: Tree-structured command parser supporting nested subcommands
- **executor.js**: Loads and executes command handlers from libs/commands/
- **commands.json**: Command tree definition with parameters and handlers
- **index.js**: Entry point with help/version handling

### 2. Chain Interaction Layer (chain/)

Thin wrappers around ethers.js v6:
- **provider.js**: JsonRpcProvider initialization
- **signer.js**: Wallet signer creation
- **deploy.js**: Contract deployment
- **tx.js**: Contract function calls
- **abi.js**: ABI encoding/decoding

### 3. Core Contracts (libs/fsca-core/)

**ClusterManager** (structure/clustermanager.sol):
- Central registry for all contracts (id → name → address)
- Operator permission management (rootAdmin → operators)
- Delegates to EvokerManager for mount/unmount operations
- Provides BeforeMount functions to configure pods before mounting

**EvokerManager** (structure/evokermanager.sol):
- Manages contract dependency graph using adjacency lists
- mount(): Reads contract's activePod/passivePod and creates bidirectional edges
- unmount(): Removes all edges and unlocks neighbors
- mountSingle/unmountSingle(): Add/remove individual edges after mount

**NormalTemplate** (lib/normaltemplate.sol):
- Base class for all business contracts
- **activePod**: Modules this contract actively calls (outgoing dependencies)
- **passivePod**: Modules that call this contract (incoming dependencies)
- **whetherMounted**: Lock flag (0=unlocked, 1=locked). Must be 0 to modify pods
- Provides modifiers: activeModuleVerification, passiveModuleVerification

**AddressPod** (lib/addresspod.sol):
- Library for managing Module arrays with O(1) lookup via mapping(contractId → index+1)
- Operations: add, remove, update, get, exists, verifyModule

**MultiSigWallet** (wallet/multisigwallet.sol):
- Standard multi-sig with submit/confirm/execute/revoke
- Governance: proposeAddOwner, proposeRemoveOwner, proposeChangeThreshold

**ProxyWallet** (wallet/proxywallet.sol):
- Hierarchical permission system (_userRights: address → level)
- Used as RightManager in cluster

### 4. Command Handlers (libs/commands/)

All handlers receive: `{ rootDir, args, subcommands, config, commandName }`

**Key commands**:
- **init/init.js**: Installs Hardhat, copies fsca-core contracts to contracts/undeployed/, creates project.json
- **cluster/init.js**: Deploys MultiSigWallet → ClusterManager → EvokerManager → ProxyWallet, configures via multi-sig
- **deploy.js**: Compiles, deploys NormalTemplate-based contract, updates project.json cache
- **cluster/mount.js**: Calls ClusterManager.registerContract(), triggers EvokerManager.mount()
- **cluster/upgrade.js**: Hot-swap: reads old contract pods → deploys new → copies pods → unmount old → mount new
- **cluster/link.js**: Adds pod before mount via ClusterManager.addActivePodBeforeMount/addPassivePodBeforeMount
- **cluster/unlink.js**: Removes pod after mount via ClusterManager.removeActivePodAfterMount/removePassivePodAfterMount

## Key Concepts

### Pod System
- **Active Pod**: Contracts this contract calls (dependencies)
- **Passive Pod**: Contracts that call this contract (dependents)
- Pods can only be modified when whetherMounted=0 (unlocked)

### Mount/Unmount Flow
1. **Before Mount**: Contract deployed, pods configured via ClusterManager.addActivePodBeforeMount()
2. **Mount**: ClusterManager.registerContract() → EvokerManager.mount() → creates all edges, locks contract
3. **After Mount**: Use ClusterManager.addActivePodAfterMount() to add edges (calls EvokerManager.mountSingle)
4. **Unmount**: ClusterManager.deleteContract() → EvokerManager.unmount() → removes all edges, unlocks neighbors

### Hot-Swap Upgrade
The upgrade command performs atomic replacement:
1. Read old contract's pod configuration
2. Deploy new contract
3. Copy pod config to new contract (BeforeMount)
4. Unmount old contract (removes all edges)
5. Mount new contract (recreates all edges)

Use `--skip-copy-pods` if new contract has different dependencies.

## Project Configuration

**project.json** (created by `fsca init`):
```json
{
  "network": { "name", "rpc", "chainId", "blockConfirmations" },
  "account": { "privateKey", "address" },
  "fsca": {
    "clusterAddress": "ClusterManager address",
    "multisigAddress": "MultiSigWallet address",
    "evokerManagerAddress": "EvokerManager address",
    "rightManagerAddress": "ProxyWallet address",
    "currentOperating": "Currently selected contract address",
    "alldeployedcontracts": [],
    "runningcontracts": [],
    "unmountedcontracts": []
  }
}
```

## Directory Structure

```
contracts/
  undeployed/          # Source contracts (copied from libs/fsca-core/)
    lib/               # addressPod.sol, normaltemplate.sol, noReentryGuard.sol
    structure/         # clustermanager.sol, evokermanager.sol
    wallet/            # multisigwallet.sol, proxywallet.sol
  deployed/            # Archived deployed contracts with metadata
cli/
  index.js             # Entry point
  parser.js            # Command parser
  executor.js          # Command executor
  commands.json        # Command tree
chain/                 # Ethers.js wrappers
wallet/                # Signer utilities
libs/
  commands/            # Command handlers
  fsca-core/           # Core Solidity contracts (source)
  logger.js            # Colored output
test/
  unit/                # Unit tests
  integration/         # Integration tests
```

## Important Implementation Notes

1. **Neighbor Locking**: When unmounting, EvokerManager unlocks all neighbors (setWhetherMounted(0)) before removing edges to avoid lock conflicts

2. **NonceManager**: The upgrade command uses ethers.NonceManager to ensure sequential nonces across multiple transactions

3. **Artifact Loading**: Commands search multiple paths for compiled artifacts (undeployed/, undeployed/lib/, undeployed/structure/, etc.)

4. **Cache Management**: project.json maintains three arrays:
   - alldeployedcontracts: All deployed contracts
   - runningcontracts: Currently mounted contracts
   - unmountedcontracts: Deployed but not mounted

5. **Multi-sig Flow**: Cluster operations requiring rootAdmin use MultiSigWallet: submitTransaction → confirmTransaction → executeTransaction

6. **Contract Archiving**: deploy.js copies deployed contracts to contracts/deployed/ with metadata comments

## Common Development Workflow

```bash
# 1. Initialize project
fsca init

# 2. Deploy cluster infrastructure
fsca cluster init

# 3. Deploy business contract
fsca deploy --contract TradeEngine --description "Trade Engine v1"

# 4. Mount to cluster
fsca cluster mount 1 "Trade Engine v1"

# 5. Link dependencies (if needed)
fsca cluster link active 0xTargetAddr 2

# 6. Hot-swap upgrade
fsca cluster upgrade --id 1 --contract TradeEngineV2
```
