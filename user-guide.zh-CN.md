# Arkheion CLI 用户指南

本文件是 Arkheion CLI 的**全命令参考手册**。  
最佳实践请统一查看：
- `documents/Arkheion_CLI_最佳实践_链上微服务集群.md`

## 推荐命令顺序
1. `arkheion init`
2. `arkheion cluster init`
3. `arkheion deploy --contract <ContractName>`
4. 校验与装配：
   - `arkheion cluster check`
   - `arkheion cluster auto --dry-run`
   - `arkheion cluster auto`

## 全局命令
| 命令 | 用法 | 说明 |
|---|---|---|
| `arkheion help` | `arkheion help` | 显示帮助信息。 |
| `arkheion init` | `arkheion init [--networkName <name>] [--rpc <url>] [--chainId <id>] [--blockConfirmations <num>] [--accountPrivateKey <key>] [--address <addr>]` | 初始化 Arkheion 项目。 |
| `arkheion deploy` | `arkheion deploy --contract <ContractName> [--description <name>] [--cleanup <keep\|soft\|hard>] [--yes]` | 部署继承 `normalTemplate` 的业务合约。 |

## Wallet 命令

所有写操作命令（`submit`、`confirm`、`execute`、`revoke`、`propose`）在提交任何链上交易前都会弹出交互确认。在 CI/自动化场景中传入 `--yes` 可跳过确认。

| 命令 | 用法 | 说明 |
|---|---|---|
| `arkheion wallet submit` | `arkheion wallet submit --to <address> --value <amount> --data <hex> [--yes]` | 提交多签交易。 |
| `arkheion wallet confirm` | `arkheion wallet confirm <txIndex> [--yes]` | 确认待执行交易。 |
| `arkheion wallet execute` | `arkheion wallet execute <txIndex> [--yes]` | 执行达到阈值的交易。 |
| `arkheion wallet revoke` | `arkheion wallet revoke <txIndex> [--yes]` | 撤销已确认。 |
| `arkheion wallet list` | `arkheion wallet list [--pending]` | 列出交易（显示实时有效确认数）。 |
| `arkheion wallet info` | `arkheion wallet info <txIndex>` | 查看交易详情（显示实时有效确认数）。 |
| `arkheion wallet owners` | `arkheion wallet owners` | 查看所有 owner 与阈值。 |
| `arkheion wallet propose add-owner` | `arkheion wallet propose add-owner <address> [--yes]` | 提议新增 owner。 |
| `arkheion wallet propose remove-owner` | `arkheion wallet propose remove-owner <address> [--yes]` | 提议移除 owner。 |
| `arkheion wallet propose change-threshold` | `arkheion wallet propose change-threshold <threshold> [--yes]` | 提议修改确认阈值。 |

> **关于有效确认数**：`wallet list`、`wallet info`、`wallet confirm`、`wallet revoke`、`wallet execute` 均显示**有效确认数** —— 仅统计当前 owner 列表中的确认，移除 owner 后自动修正，不会读取过期的 `numConfirmations` 字段。

## Cluster 命令
| 命令 | 用法 | 说明 |
|---|---|---|
| `arkheion cluster init` | `arkheion cluster init [--threshold <num>] [--cleanup <keep\|soft\|hard>] [--yes]` | 部署集群核心合约。 |
| `arkheion cluster graph` | `arkheion cluster graph` | 生成 Mermaid 拓扑图。 |
| `arkheion cluster list mounted` | `arkheion cluster list mounted` | 列出已挂载合约。 |
| `arkheion cluster list all` | `arkheion cluster list all` | 列出全部合约（含历史）。 |
| `arkheion cluster info` | `arkheion cluster info <id>` | 按 ID 查询合约详情。 |
| `arkheion cluster current` | `arkheion cluster current` | 查看当前操作合约。 |
| `arkheion cluster choose` | `arkheion cluster choose <address>` | 选择当前操作合约。 |
| `arkheion cluster link` | `arkheion cluster link <type> <targetAddress> <targetId>` | 添加 active/passive 依赖。 |
| `arkheion cluster unlink` | `arkheion cluster unlink <type> <targetAddress> <targetId>` | 解除依赖。 |
| `arkheion cluster mount` | `arkheion cluster mount <id> <name>` | 将当前合约挂载进集群。 |
| `arkheion cluster unmount` | `arkheion cluster unmount <id>` | 从集群卸载合约。 |
| `arkheion cluster upgrade` | `arkheion cluster upgrade --id <id> --contract <ContractName> [--skip-copy-pods] [--cleanup <keep\|soft\|hard>] [--yes]` | 热升级已挂载合约。 |
| `arkheion cluster auto` | `arkheion cluster auto [--dry-run] [--cleanup <keep\|soft\|hard>] [--yes]` | 按注解自动部署/链接/挂载。 |
| `arkheion cluster check` | `arkheion cluster check` | 静态检查注解、ID 冲突、环依赖（不写链）。 |
| `arkheion cluster rollback` | `arkheion cluster rollback --id <contractId> [--generation <n>] [--dry-run] [--yes]` | 回滚到历史 `deprecated` 版本。 |
| `arkheion cluster history` | `arkheion cluster history --id <contractId>` | 查看指定 contractId 的版本历史。 |
| `arkheion cluster operator list` | `arkheion cluster operator list` | 列出 Operator。 |
| `arkheion cluster operator add` | `arkheion cluster operator add <address>` | 添加 Operator。 |
| `arkheion cluster operator remove` | `arkheion cluster operator remove <address>` | 移除 Operator。 |

## Normal 命令
| 命令 | 用法 | 说明 |
|---|---|---|
| `arkheion normal right set` | `arkheion normal right set <abiId> <maxRight>` | 设置 ABI 权限等级。 |
| `arkheion normal right remove` | `arkheion normal right remove <abiId>` | 移除 ABI 权限。 |
| `arkheion normal get modules` | `arkheion normal get modules <type>` | 查询 active/passive 模块。 |
