# Arkheion CLI 用户指南

## 概述

Arkheion CLI 是一个用于管理链上智能合约集群的命令行工具。它支持在托管集群架构中部署、挂载、链接和热替换合约，并通过多签治理进行管理。

---

## 安装与初始化

```bash
# 安装依赖
npm install

# 初始化 Arkheion 项目
arkheion init

# 部署集群基础设施
arkheion cluster init
```

`arkheion init` 创建 `project.json`，安装 Hardhat，并将核心合约复制到 `contracts/undeployed/`。

`arkheion cluster init` 按顺序部署 MultiSigWallet → ClusterManager → EvokerManager → ProxyWallet，并通过多签治理完成配置。

---

## project.json

所有状态存储在项目根目录的 `project.json` 中：

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

> 基础设施合约（MultiSigWallet、ClusterManager、EvokerManager、ProxyWallet）仅通过专用地址字段追踪，不会出现在 `alldeployedcontracts` 或 `runningcontracts` 中。这两个数组专用于带有 `@arkheion-id` 注解的业务合约。

---

## 部署业务合约

```bash
# 编译并部署合约
arkheion deploy --contract TradeEngine --description "Trade Engine v1"

# 跳过确认提示（CI/自动化场景）
arkheion deploy --contract TradeEngine --yes
```

---

## 集群操作

### 挂载合约

```bash
arkheion cluster mount 1 "Trade Engine v1"
```

### 链接依赖

```bash
# 挂载前添加 active pod
arkheion cluster link active 0xTargetAddr 2

# 挂载后移除 pod
arkheion cluster unlink active 0xTargetAddr 2
```

### 热替换升级

```bash
arkheion cluster upgrade --id 1 --contract TradeEngineV2 --yes
```

### 回滚

```bash
# 回滚到上一个版本
arkheion cluster rollback --id 1 --yes

# 回滚到指定版本
arkheion cluster rollback --id 1 --generation 2 --yes

# 预览（不执行链上操作）
arkheion cluster rollback --id 1 --dry-run
```

### 版本历史

```bash
arkheion cluster history --id 1
```

---

## 自动装配

在 Solidity 合约中添加注解：

```solidity
// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive
// @arkheion-auto yes
contract TradeEngineV1 is normalTemplate, NoReentryGuard {
```

然后执行：

```bash
# 仅静态检查（不执行链上操作）
arkheion cluster auto check

# 预览执行计划
arkheion cluster auto --dry-run

# 完整自动装配
arkheion cluster auto --yes
```

**装配顺序：** 全部部署 → 全部链接（beforeMount）→ 全部挂载 → 链接 pod 环边（afterMount）。

**环路处理：**
- Pod 级别环路：自动延迟到 afterMount 处理
- 函数级别环路：永久跳过，记录在 `auto-report.json` 中

---

## 多签钱包命令

所有侵入式钱包命令在执行链上操作前都需要确认。在 CI 中使用 `--yes` 跳过确认。

### 提交交易

```bash
arkheion wallet submit --to 0xAddr --data 0xABCD --yes
```

### 确认交易

```bash
arkheion wallet confirm 0 --yes
```

### 执行交易

```bash
arkheion wallet execute 0 --yes
```

### 撤销确认

```bash
arkheion wallet revoke 0 --yes
```

### 治理提案

```bash
arkheion wallet propose add-owner 0xNewOwner --yes
arkheion wallet propose remove-owner 0xOldOwner --yes
arkheion wallet propose change-threshold 2 --yes
```

### 查看交易

```bash
# 列出所有交易（显示有效确认数）
arkheion wallet list

# 仅列出待处理交易
arkheion wallet list --pending

# 查看交易详情
arkheion wallet info 0

# 查看所有者和阈值
arkheion wallet owners
```

> `wallet list` 和 `wallet info` 显示**有效确认数**——仅统计当前所有者的确认，即使有所有者被移除后也能保持准确。

---

## 清理策略

`deploy`、`cluster init`、`cluster auto` 和 `cluster upgrade` 均支持 `--cleanup`：

| 模式 | 行为 |
|------|------|
| `keep`（默认）| 不清理 |
| `soft` | 将源码和产物移动到 `contracts/archived/<timestamp>/` |
| `hard` | 删除源码 `.sol` 和产物 `.json` 文件 |

在 `project.json` 中设置默认值：

```json
"arkheion": {
  "cleanupPolicy": { "defaultMode": "soft" }
}
```

---

## 冲突检测

在任何编译部署操作前，Arkheion 会检查：

- **产物名称冲突**：同一合约名从多个源文件编译
- **源码名称冲突**：存在同名的重复 `.sol` 文件
- **`@arkheion-id` 冲突**：同一 ID 被多个合约使用

发现冲突时，命令会在触碰链之前退出并给出明确错误信息。

---

## 日志

所有 CLI 输出写入 `logs/<YYYY-MM-DD>.log`，ANSI 颜色码已剥离，每个会话以 `SESSION START/END` 行分隔。

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `Arkheion_RPC_URL` | 覆盖 `project.json` 中的 `network.rpc` |
| `Arkheion_PRIVATE_KEY` | 覆盖 `project.json` 中的 `account.privateKey` |
| `DEBUG` | 出错时打印完整堆栈 |
