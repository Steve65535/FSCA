# Arkheion CLI User Guide

## Overview

Arkheion CLI is a command-line tool for managing on-chain smart contract clusters. It handles deploying, mounting, linking, and hot-swapping contracts in a managed cluster architecture with multi-signature governance.

---

## Installation & Initialization

```bash
# Install dependencies
npm install

# Initialize a new Arkheion project
arkheion init

# Deploy cluster infrastructure
arkheion cluster init
```

`arkheion init` creates `project.json`, installs Hardhat, and copies core contracts to `contracts/undeployed/`.

`arkheion cluster init` deploys MultiSigWallet → ClusterManager → EvokerManager → ProxyWallet and wires them together via multi-sig governance.

---

## project.json

All state is stored in `project.json` at the project root:

```json
{
  "network": { "name": "...", "rpc": "...", "chainId": 1, "blockConfirmations": 1 },
  "account": { "privateKey": "0x...", "address": "0x..." },
  "arkheion": {
    "clusterAddress": "0x...",
    "multisigAddress": "0x...",
    "evokerManagerAddress": "0x...",
    "rightManagerAddress": "0x...",
    "alldeployedcontracts": [],
    "runningcontracts": [],
    "unmountedcontracts": []
  }
}
```

> Infrastructure contracts (MultiSigWallet, ClusterManager, EvokerManager, ProxyWallet) are tracked by their dedicated address fields only — they do not appear in `alldeployedcontracts` or `runningcontracts`. Those arrays are reserved for business contracts with `@arkheion-id` annotations.

---

## Deploying Business Contracts

```bash
# Compile and deploy a contract
arkheion deploy --contract TradeEngine --description "Trade Engine v1"

# Skip confirmation prompt (CI/automation)
arkheion deploy --contract TradeEngine --yes
```

---

## Cluster Operations

### Mount a contract

```bash
arkheion cluster mount 1 "Trade Engine v1"
```

### Link dependencies

```bash
# Add active pod (before mount)
arkheion cluster link active 0xTargetAddr 2

# Remove pod (after mount)
arkheion cluster unlink active 0xTargetAddr 2
```

### Hot-swap upgrade

```bash
arkheion cluster upgrade --id 1 --contract TradeEngineV2 --yes
```

### Rollback

```bash
# Roll back to previous generation
arkheion cluster rollback --id 1 --yes

# Roll back to specific generation
arkheion cluster rollback --id 1 --generation 2 --yes

# Preview without chain ops
arkheion cluster rollback --id 1 --dry-run
```

### Version history

```bash
arkheion cluster history --id 1
```

---

## Auto-Assembly

Add annotations to your Solidity contracts:

```solidity
// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive
// @arkheion-auto yes
contract TradeEngineV1 is normalTemplate, NoReentryGuard {
```

Then run:

```bash
# Static check only (no chain ops)
arkheion cluster auto check

# Preview execution plan
arkheion cluster auto --dry-run

# Full auto-assembly
arkheion cluster auto --yes
```

**Assembly order:** deploy all → link all (beforeMount) → mount all → link pod-cycle edges (afterMount).

**Cycle handling:**
- Pod-level cycles: automatically deferred to afterMount
- Function-level cycles: permanently skipped, reported in `auto-report.json`

---

## MultiSig Wallet Commands

All invasive wallet commands require confirmation before executing on-chain. Use `--yes` to skip in CI.

### Submit a transaction

```bash
arkheion wallet submit --to 0xAddr --data 0xABCD --yes
```

### Confirm a transaction

```bash
arkheion wallet confirm 0 --yes
```

### Execute a transaction

```bash
arkheion wallet execute 0 --yes
```

### Revoke a confirmation

```bash
arkheion wallet revoke 0 --yes
```

### Governance proposals

```bash
arkheion wallet propose add-owner 0xNewOwner --yes
arkheion wallet propose remove-owner 0xOldOwner --yes
arkheion wallet propose change-threshold 2 --yes
```

### View transactions

```bash
# List all transactions (valid confirmations shown)
arkheion wallet list

# List pending only
arkheion wallet list --pending

# View transaction details
arkheion wallet info 0

# View owners and threshold
arkheion wallet owners
```

> `wallet list` and `wallet info` display **valid confirmations** — a live recount from current owners only. This is accurate even after owners are removed.

---

## Cleanup Policy

`deploy`, `cluster init`, `cluster auto`, and `cluster upgrade` accept `--cleanup`:

| Mode | Behavior |
|------|----------|
| `keep` (default) | No cleanup |
| `soft` | Moves source + artifact to `contracts/archived/<timestamp>/` |
| `hard` | Deletes source `.sol` and artifact `.json` files |

Set a default in `project.json`:

```json
"arkheion": {
  "cleanupPolicy": { "defaultMode": "soft" }
}
```

---

## Conflict Detection

Before any compile-and-deploy operation, Arkheion checks for:

- **Artifact name conflicts**: same contract name compiled from multiple source files
- **Source name conflicts**: duplicate `.sol` files with the same contract name
- **`@arkheion-id` conflicts**: same ID used by more than one contract

If conflicts are found, the command exits with a clear error before touching the chain.

---

## Logs

All CLI output is written to `logs/<YYYY-MM-DD>.log`. ANSI codes are stripped. Each session is delimited by `SESSION START/END` lines.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `Arkheion_RPC_URL` | Overrides `network.rpc` in `project.json` |
| `Arkheion_PRIVATE_KEY` | Overrides `account.privateKey` in `project.json` |
| `DEBUG` | Print full stack traces on error |
