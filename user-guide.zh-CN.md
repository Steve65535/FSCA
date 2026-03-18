# FSCA CLI 用户指南

本文件是 FSCA CLI 的**全命令参考手册**。  
最佳实践请统一查看：
- `documents/FSCA_CLI_最佳实践_链上微服务集群.md`

## 推荐命令顺序
1. `fsca init`
2. `fsca cluster init`
3. `fsca deploy --contract <ContractName>`
4. 校验与装配：
   - `fsca cluster check`
   - `fsca cluster auto --dry-run`
   - `fsca cluster auto`

## 全局命令
| 命令 | 用法 | 说明 |
|---|---|---|
| `fsca help` | `fsca help` | 显示帮助信息。 |
| `fsca init` | `fsca init [--networkName <name>] [--rpc <url>] [--chainId <id>] [--blockConfirmations <num>] [--accountPrivateKey <key>] [--address <addr>]` | 初始化 FSCA 项目。 |
| `fsca deploy` | `fsca deploy --contract <ContractName> [--description <name>] [--cleanup <keep\|soft\|hard>] [--yes]` | 部署继承 `normalTemplate` 的业务合约。 |

## Wallet 命令
| 命令 | 用法 | 说明 |
|---|---|---|
| `fsca wallet submit` | `fsca wallet submit --to <address> --value <amount> --data <hex>` | 提交多签交易。 |
| `fsca wallet confirm` | `fsca wallet confirm <txIndex>` | 确认待执行交易。 |
| `fsca wallet execute` | `fsca wallet execute <txIndex>` | 执行达到阈值的交易。 |
| `fsca wallet revoke` | `fsca wallet revoke <txIndex>` | 撤销已确认。 |
| `fsca wallet list` | `fsca wallet list [--pending]` | 列出交易。 |
| `fsca wallet info` | `fsca wallet info <txIndex>` | 查看交易详情。 |
| `fsca wallet owners` | `fsca wallet owners` | 查看所有 owner 与阈值。 |
| `fsca wallet propose add-owner` | `fsca wallet propose add-owner <address>` | 提议新增 owner。 |
| `fsca wallet propose remove-owner` | `fsca wallet propose remove-owner <address>` | 提议移除 owner。 |
| `fsca wallet propose change-threshold` | `fsca wallet propose change-threshold <threshold>` | 提议修改确认阈值。 |

## Cluster 命令
| 命令 | 用法 | 说明 |
|---|---|---|
| `fsca cluster init` | `fsca cluster init [--threshold <num>] [--cleanup <keep\|soft\|hard>] [--yes]` | 部署集群核心合约。 |
| `fsca cluster graph` | `fsca cluster graph` | 生成 Mermaid 拓扑图。 |
| `fsca cluster list mounted` | `fsca cluster list mounted` | 列出已挂载合约。 |
| `fsca cluster list all` | `fsca cluster list all` | 列出全部合约（含历史）。 |
| `fsca cluster info` | `fsca cluster info <id>` | 按 ID 查询合约详情。 |
| `fsca cluster current` | `fsca cluster current` | 查看当前操作合约。 |
| `fsca cluster choose` | `fsca cluster choose <address>` | 选择当前操作合约。 |
| `fsca cluster link` | `fsca cluster link <type> <targetAddress> <targetId>` | 添加 active/passive 依赖。 |
| `fsca cluster unlink` | `fsca cluster unlink <type> <targetAddress> <targetId>` | 解除依赖。 |
| `fsca cluster mount` | `fsca cluster mount <id> <name>` | 将当前合约挂载进集群。 |
| `fsca cluster unmount` | `fsca cluster unmount <id>` | 从集群卸载合约。 |
| `fsca cluster upgrade` | `fsca cluster upgrade --id <id> --contract <ContractName> [--skip-copy-pods] [--cleanup <keep\|soft\|hard>] [--yes]` | 热升级已挂载合约。 |
| `fsca cluster auto` | `fsca cluster auto [--dry-run] [--cleanup <keep\|soft\|hard>] [--yes]` | 按注解自动部署/链接/挂载。 |
| `fsca cluster check` | `fsca cluster check` | 静态检查注解、ID 冲突、环依赖（不写链）。 |
| `fsca cluster rollback` | `fsca cluster rollback --id <contractId> [--generation <n>] [--dry-run] [--yes]` | 回滚到历史 `deprecated` 版本。 |
| `fsca cluster history` | `fsca cluster history --id <contractId>` | 查看指定 contractId 的版本历史。 |
| `fsca cluster operator list` | `fsca cluster operator list` | 列出 Operator。 |
| `fsca cluster operator add` | `fsca cluster operator add <address>` | 添加 Operator。 |
| `fsca cluster operator remove` | `fsca cluster operator remove <address>` | 移除 Operator。 |

## Normal 命令
| 命令 | 用法 | 说明 |
|---|---|---|
| `fsca normal right set` | `fsca normal right set <abiId> <maxRight>` | 设置 ABI 权限等级。 |
| `fsca normal right remove` | `fsca normal right remove <abiId>` | 移除 ABI 权限。 |
| `fsca normal get modules` | `fsca normal get modules <type>` | 查询 active/passive 模块。 |
