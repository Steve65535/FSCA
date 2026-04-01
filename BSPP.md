# BSPP - 区块流处理流水线 (Block Stream Processing Pipeline)
https://github.com/Steve65535/BSPP
[English](./README.md) | 中文文档

BSPP 是一款高性能、高可靠的区块链数据 ETL 流水线，专为企业级审计、实时报表和智能合约架构管理设计。作为 [Arkheion-CLI](https://github.com/Steve65535/arkheion-cli) 的核心配套数据层，它提供了从链上原始数据到业务可读数据的完整转化能力。

---

## 📖 目录
- [核心特性](#核心特性)
- [核心架构](#核心架构)
- [技术深挖](#技术深挖)
  - [递归 ABI 解码](#递归-abi-解码)
  - [状态实时追踪](#状态实时追踪)
  - [重组 (Reorg) 自动化处理](#重组-reorg-自动化处理)
- [快速入门](#快速入门)
- [性能指标](#性能指标)
- [与 Arkheion-CLI 的协同](#与-arkheion-cli-的协同)

---

## 🚀 核心特性

- **钻石级可靠性 (P0)**
  - **原子化游标**：实现区块级的原子更新，确保系统在崩溃重启后能精准从断点恢复，不重不漏。
  - **回执级确认**：深度拉取 Transaction Receipt，准确区分交易的 `Success` 或 `Reverted` 状态，并记录实际 Gas 消耗。
- **深度解析解析 (P1)**
  - **递归 ABI 解码**：打破传统解码只解析第一层的局限，支持对嵌套在 `bytes` 中的多级调用进行深度拆解。
  - **重组 (Reorg) 监测**：通过 `parentHash` 链式校验实时感知区块链重组，并提供毫秒级的回滚能力。
  - **全量存储追踪**：基于 `accessList` 覆盖所有存储变量变更，真正实现对合约内部状态的 Ground Truth 捕获。
- **工业级性能**
  - 单机解码速度超过 20 万次/秒。
  - 支持 Worker-Pool 并行处理，轻松跑满企业级存储 I/O 带宽。

---

## 🏗️ 核心架构

```mermaid
graph TD
    A[Blockchain RPC] -->|Parallel Fetch| B[Ingest Layer]
    B -->|Eth GetBlockByNumber| C[Pipeline Orchestrator]
    C -->|Batch Receipts| D[Receipt Processing]
    C -->|Recursive Decode| E[ABI Registry]
    C -->|Storage Snapshot| F[State Tracker]
    D -->|Atomic Commit| G[(PostgreSQL)]
    E -->|Atomic Commit| G
    F -->|Atomic Commit| G
    G -->|Update Cursor| H[Sync Cursor]
```

---

## 🔍 技术深挖

### 递归 ABI 解码
在处理如 **Uniswap V3 Multi-hop** 或 **Multicall3** 交易时，参数常被封装在 `bytes` 内。BSPP 会根据 ABI 注册表递归扫描 payload，自动拆解：
- `Multicall.aggregate` -> 内部调用 A -> 内部调用 B -> ...
- 所有的层级数据均以结构化 `JSONB` 格式存入 `contract_txs` 表。

### 状态实时追踪
不同于单纯的 Event 分析，BSPP 通过分析 `eth_getTransactionReceipt` 提供的 `accessList`（或通过模拟执行推断）：
1. 识别交易访问的所有存储槽 (Storage Slots)。
2. 实时调用 `eth_getStorageAt` 捕获变量最新值。
3. 确保审计人员看到的变量值与链上真实状态物理一致。

### 重组 (Reorg) 自动化处理
BSPP 维护一个链式游标。处理每个区块前都会检查：
`CurrentBlock.ParentHash == LastProcessedBlock.Hash`
- **匹配**：继续处理。
- **失配**：检测到重组，立即停止流水线，回滚 N 个受影响区块的所有数据（Native, Contract, Storage），并自动重新拉取正确的分叉。

---

## 🛠️ 快速入门

### 1. 前置要求
- **Go**: v1.21+
- **PostgreSQL**: v15+ (需支持 JSONB)
- **RPC 节点**: 支持 `eth_getBlockReceipts` (建议 Ankr, QuickNode 或私链节点)

### 2. 环境配置
编辑 `configs/config.json`:
```json
{
  "rpc_url": "https://your-node-url",
  "db_dsn": "postgres://user:pass@localhost:5432/bspp",
  "worker_count": 8,
  "batch_size": 10
}
```

### 3. 运行
```bash
go run ./cmd/bsppd/main.go
```

---

## 📊 性能指标

| 阶段 | 性能 (单核) |
| :--- | :--- |
| **RPC 拉取** | 取决于网络 (支持并行) |
| **ABI 解码** | ~235,756 tx/s |
| **存储写入** | ~2,300 tx/s (即将支持 pgx.Batch 优化) |
| **状态追踪** | ~0.5ms/slot |

---

## 🤝 与 Arkheion-CLI 的协同

Arkheion-CLI 用于**定义与部署**复杂的合约架构，而 BSPP 则负载**全生命周期的合规审计**：
1. **自动同步**：Arkheion-CLI 部署的新合约 ABI 可自动注入 BSPP 注册表。
2. **架构报表**：通过 BSPP 的解析数据，可以一键生成企业级合规审计报表。
3. **安全监控**：实时监控 Arkheion 架构中的关键变量变更，触发安全警报。
