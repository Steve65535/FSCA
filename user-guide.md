# FSCA CLI User Guide

This file is a **full command reference** for FSCA CLI.
For architecture/process best practices, use:
- `documents/FSCA_CLI_最佳实践_链上微服务集群.md`

## Recommended Execution Order
1. `fsca init`
2. `fsca cluster init`
3. `fsca deploy --contract <ContractName>`
4. Validate and assemble:
   - `fsca cluster check`
   - `fsca cluster auto --dry-run`
   - `fsca cluster auto`

## Global Commands
| Command | Usage | Description |
|---|---|---|
| `fsca help` | `fsca help` | Show command help. |
| `fsca init` | `fsca init [--networkName <name>] [--rpc <url>] [--chainId <id>] [--blockConfirmations <num>] [--accountPrivateKey <key>] [--address <addr>]` | Initialize an FSCA project. |
| `fsca deploy` | `fsca deploy --contract <ContractName> [--description <name>] [--cleanup <keep\|soft\|hard>] [--yes]` | Deploy a business contract inheriting `normalTemplate`. |

## Wallet Commands
| Command | Usage | Description |
|---|---|---|
| `fsca wallet submit` | `fsca wallet submit --to <address> --value <amount> --data <hex>` | Submit a multisig transaction. |
| `fsca wallet confirm` | `fsca wallet confirm <txIndex>` | Confirm a pending transaction. |
| `fsca wallet execute` | `fsca wallet execute <txIndex>` | Execute a confirmed transaction. |
| `fsca wallet revoke` | `fsca wallet revoke <txIndex>` | Revoke your confirmation. |
| `fsca wallet list` | `fsca wallet list [--pending]` | List wallet transactions. |
| `fsca wallet info` | `fsca wallet info <txIndex>` | Show transaction details. |
| `fsca wallet owners` | `fsca wallet owners` | Show owners and threshold. |
| `fsca wallet propose add-owner` | `fsca wallet propose add-owner <address>` | Propose adding an owner. |
| `fsca wallet propose remove-owner` | `fsca wallet propose remove-owner <address>` | Propose removing an owner. |
| `fsca wallet propose change-threshold` | `fsca wallet propose change-threshold <threshold>` | Propose threshold change. |

## Cluster Commands
| Command | Usage | Description |
|---|---|---|
| `fsca cluster init` | `fsca cluster init [--threshold <num>] [--cleanup <keep\|soft\|hard>] [--yes]` | Deploy core cluster contracts. |
| `fsca cluster graph` | `fsca cluster graph` | Generate Mermaid topology graph. |
| `fsca cluster list mounted` | `fsca cluster list mounted` | List mounted contracts. |
| `fsca cluster list all` | `fsca cluster list all` | List all contracts including historical records. |
| `fsca cluster info` | `fsca cluster info <id>` | Query contract metadata by ID. |
| `fsca cluster current` | `fsca cluster current` | Show current operating contract. |
| `fsca cluster choose` | `fsca cluster choose <address>` | Set current operating contract. |
| `fsca cluster link` | `fsca cluster link <type> <targetAddress> <targetId>` | Add active/passive dependency link. |
| `fsca cluster unlink` | `fsca cluster unlink <type> <targetAddress> <targetId>` | Remove dependency link. |
| `fsca cluster mount` | `fsca cluster mount <id> <name>` | Mount current contract into cluster. |
| `fsca cluster unmount` | `fsca cluster unmount <id>` | Unmount contract from cluster. |
| `fsca cluster upgrade` | `fsca cluster upgrade --id <id> --contract <ContractName> [--skip-copy-pods] [--cleanup <keep\|soft\|hard>] [--yes]` | Hot-swap a mounted contract. |
| `fsca cluster auto` | `fsca cluster auto [--dry-run] [--cleanup <keep\|soft\|hard>] [--yes]` | Auto deploy/link/mount from annotations. |
| `fsca cluster check` | `fsca cluster check` | Static check for IDs/cycles (no on-chain writes). |
| `fsca cluster rollback` | `fsca cluster rollback --id <contractId> [--generation <n>] [--dry-run] [--yes]` | Roll back to a deprecated historical version. |
| `fsca cluster history` | `fsca cluster history --id <contractId>` | Show version history for one contract ID. |
| `fsca cluster operator list` | `fsca cluster operator list` | List operators. |
| `fsca cluster operator add` | `fsca cluster operator add <address>` | Add operator. |
| `fsca cluster operator remove` | `fsca cluster operator remove <address>` | Remove operator. |

## Normal Commands
| Command | Usage | Description |
|---|---|---|
| `fsca normal right set` | `fsca normal right set <abiId> <maxRight>` | Set ABI permission level. |
| `fsca normal right remove` | `fsca normal right remove <abiId>` | Remove ABI permission. |
| `fsca normal get modules` | `fsca normal get modules <type>` | Query active/passive linked modules. |
