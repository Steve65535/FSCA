# Arkheion CLI User Guide

This file is a **full command reference** for Arkheion CLI.
For architecture/process best practices, use:
- `documents/Arkheion_CLI_最佳实践_链上微服务集群.md`

## Recommended Execution Order
1. `arkheion init`
2. `arkheion cluster init`
3. `arkheion deploy --contract <ContractName>`
4. Validate and assemble:
   - `arkheion cluster check`
   - `arkheion cluster auto --dry-run`
   - `arkheion cluster auto`

## Global Commands
| Command | Usage | Description |
|---|---|---|
| `arkheion help` | `arkheion help` | Show command help. |
| `arkheion init` | `arkheion init [--networkName <name>] [--rpc <url>] [--chainId <id>] [--blockConfirmations <num>] [--accountPrivateKey <key>] [--address <addr>]` | Initialize an Arkheion project. |
| `arkheion deploy` | `arkheion deploy --contract <ContractName> [--description <name>] [--cleanup <keep\|soft\|hard>] [--yes]` | Deploy a business contract inheriting `normalTemplate`. |

## Wallet Commands

All write commands (`submit`, `confirm`, `execute`, `revoke`, `propose`) prompt for interactive confirmation before submitting any on-chain transaction. Pass `--yes` to skip in CI/automation.

| Command | Usage | Description |
|---|---|---|
| `arkheion wallet submit` | `arkheion wallet submit --to <address> --value <amount> --data <hex> [--yes]` | Submit a multisig transaction. |
| `arkheion wallet confirm` | `arkheion wallet confirm <txIndex> [--yes]` | Confirm a pending transaction. |
| `arkheion wallet execute` | `arkheion wallet execute <txIndex> [--yes]` | Execute a confirmed transaction. |
| `arkheion wallet revoke` | `arkheion wallet revoke <txIndex> [--yes]` | Revoke your confirmation. |
| `arkheion wallet list` | `arkheion wallet list [--pending]` | List wallet transactions (shows live valid confirmations). |
| `arkheion wallet info` | `arkheion wallet info <txIndex>` | Show transaction details (shows live valid confirmations). |
| `arkheion wallet owners` | `arkheion wallet owners` | Show owners and threshold. |
| `arkheion wallet propose add-owner` | `arkheion wallet propose add-owner <address> [--yes]` | Propose adding an owner. |
| `arkheion wallet propose remove-owner` | `arkheion wallet propose remove-owner <address> [--yes]` | Propose removing an owner. |
| `arkheion wallet propose change-threshold` | `arkheion wallet propose change-threshold <threshold> [--yes]` | Propose threshold change. |

> **Note on valid confirmations**: `wallet list`, `wallet info`, `wallet confirm`, `wallet revoke`, and `wallet execute` all display *valid confirmations* — the live recount from current owners only. This is accurate even after an owner has been removed.

## Cluster Commands
| Command | Usage | Description |
|---|---|---|
| `arkheion cluster init` | `arkheion cluster init [--threshold <num>] [--cleanup <keep\|soft\|hard>] [--yes]` | Deploy core cluster contracts. |
| `arkheion cluster graph` | `arkheion cluster graph` | Generate Mermaid topology graph. |
| `arkheion cluster list mounted` | `arkheion cluster list mounted` | List mounted contracts. |
| `arkheion cluster list all` | `arkheion cluster list all` | List all contracts including historical records. |
| `arkheion cluster info` | `arkheion cluster info <id>` | Query contract metadata by ID. |
| `arkheion cluster current` | `arkheion cluster current` | Show current operating contract. |
| `arkheion cluster choose` | `arkheion cluster choose <address>` | Set current operating contract. |
| `arkheion cluster link` | `arkheion cluster link <type> <targetAddress> <targetId>` | Add active/passive dependency link. |
| `arkheion cluster unlink` | `arkheion cluster unlink <type> <targetAddress> <targetId>` | Remove dependency link. |
| `arkheion cluster mount` | `arkheion cluster mount <id> <name>` | Mount current contract into cluster. |
| `arkheion cluster unmount` | `arkheion cluster unmount <id>` | Unmount contract from cluster. |
| `arkheion cluster upgrade` | `arkheion cluster upgrade --id <id> --contract <ContractName> [--skip-copy-pods] [--cleanup <keep\|soft\|hard>] [--yes]` | Hot-swap a mounted contract. |
| `arkheion cluster auto` | `arkheion cluster auto [--dry-run] [--cleanup <keep\|soft\|hard>] [--yes]` | Auto deploy/link/mount from annotations. |
| `arkheion cluster check` | `arkheion cluster check` | Static check for IDs/cycles (no on-chain writes). |
| `arkheion cluster rollback` | `arkheion cluster rollback --id <contractId> [--generation <n>] [--dry-run] [--yes]` | Roll back to a deprecated historical version. |
| `arkheion cluster history` | `arkheion cluster history --id <contractId>` | Show version history for one contract ID. |
| `arkheion cluster operator list` | `arkheion cluster operator list` | List operators. |
| `arkheion cluster operator add` | `arkheion cluster operator add <address>` | Add operator. |
| `arkheion cluster operator remove` | `arkheion cluster operator remove <address>` | Remove operator. |

## Normal Commands
| Command | Usage | Description |
|---|---|---|
| `arkheion normal right set` | `arkheion normal right set <abiId> <maxRight>` | Set ABI permission level. |
| `arkheion normal right remove` | `arkheion normal right remove <abiId>` | Remove ABI permission. |
| `arkheion normal get modules` | `arkheion normal get modules <type>` | Query active/passive linked modules. |
