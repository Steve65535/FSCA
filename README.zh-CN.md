<p align="center">
  <img src="assets/logo_banner.png" alt="Arkheion — 智能合约集群编排器" width="480" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/arkheion-cli"><img src="https://img.shields.io/npm/v/arkheion-cli?style=flat-square&color=4F46E5" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-06B6D4?style=flat-square" alt="License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D16-brightgreen?style=flat-square" alt="Node" /></a>
  <a href="#"><img src="https://img.shields.io/badge/solidity-%5E0.8-363636?style=flat-square&logo=solidity" alt="Solidity" /></a>
  <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" /></a>
</p>

<p align="center">
  <a href="README.md">🇺🇸 English</a> ·
  <a href="user-guide.zh-CN.md">📖 使用指南</a> ·
  <a href="CONTRIBUTING.md">🤝 贡献指南</a> ·
  <a href="SECURITY.md">🔒 安全策略</a>
</p>

---

# Arkheion — Full Stack Contract Architecture

> 智能合约的微服务架构。

Arkheion 是一个用于构建**模块化、可升级、系统级智能合约**的开发框架。

它不把协议当作一个带升级模式的单体合约（如代理模式），而是将其视为一个**可组合的服务系统**：

- 每个模块是一个独立的合约服务
- 状态与逻辑分离，升级更安全
- 服务通过集群层编排
- 为复杂的、长期运行的系统设计 —— 而不仅仅是单个合约

---

## 为什么选择 Arkheion？

随着智能合约超越简单应用，**系统复杂度成为真正的瓶颈**：

- 单体合约难以安全升级
- 模块化模式仍然共享状态，产生耦合
- 复杂协议缺乏清晰的系统架构

Arkheion 引入了一种新范式：

> **从单合约升级 → 到系统级架构**

---

## 1 分钟上手

```bash
arkheion init
arkheion cluster init

# 给合约加注解，然后一条命令完成所有事：
arkheion cluster auto
```

在合约中添加注解：

```solidity
// @arkheion-id 1
// @arkheion-active
// @arkheion-passive
// @arkheion-auto yes
contract AccountStorage is normalTemplate { ... }

// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive
// @arkheion-auto yes
contract TradeEngine is normalTemplate { ... }
```

然后运行：

```bash
arkheion cluster auto check   # 静态分析：ID 冲突、pod 环、函数调用环
arkheion cluster auto         # 全自动：deploy all → link all → mount all
```

---

## 🧬 问题背景

现代 DApp（DeFi、GameFi、NFT 市场）通常将**数千行高度耦合的 Solidity 代码**塞进一个巨型合约，或者藏在脆弱的代理模式后面。升级一个函数意味着重新部署整个单体。一个漏洞就能掏空整个资金池。没有服务发现，没有依赖关系图，没有治理层 —— 只有硬编码的地址散落在各处。

**Arkheion 解决这个问题。**

## 💡 什么是 Arkheion？

Arkheion（**Full Stack Contract Architecture**）将 **Kubernetes** 的思维模型引入智能合约开发：

| Kubernetes | Arkheion |
|------------|------|
| Cluster | `ClusterManager` — 全网服务注册中心与路由器 |
| Pod | `NormalTemplate` — 独立的、职责单一的合约单元 |
| Service Mesh | `EvokerManager` — 运行时依赖图与鉴权防火墙 |
| RBAC | `ProxyWallet` — 多签门限治理 |
| kubectl | `arkheion-cli` — 一条命令完成部署、挂载、链接、升级 |

```
┌─────────────────────────────────────────────────────┐
│                  arkheion-cli (终端)                     │ ← 开发者接口
├─────────────────────────────────────────────────────┤
│  ClusterManager · EvokerManager · ProxyWallet       │ ← 编排调度层
├─────────────────────────────────────────────────────┤
│  Pod A ←→ Pod B ←→ Pod C ←→ Pod D  ...              │ ← 业务逻辑层
└─────────────────────────────────────────────────────┘
```

每个 Pod 继承自 **NormalTemplate**，框架自动注入安全钩子、挂载/卸载生命周期控制和双向鉴权修饰器。开发者只需编写**纯业务逻辑**，其余的事情框架全部处理。

---

## ⚡ 快速开始

```bash
# 安装
npm install -g arkheion-cli

# 初始化项目
arkheion init

# 部署编排骨架（ClusterManager + EvokerManager + ProxyWallet）
arkheion cluster init

# 部署两个业务合约
arkheion deploy --contract LendingPool
arkheion deploy --contract PriceOracle

# 挂载到集群
arkheion cluster mount 1 "LendingPool"
arkheion cluster mount 2 "PriceOracle"

# 建立依赖关系（LendingPool → PriceOracle）
arkheion cluster link active 0xOracleAddr... 2

# 可视化拓扑图
arkheion cluster graph
```

或使用**声明式自动装配**（推荐用于多合约系统）：

```bash
# 在每个合约源码顶部添加 @arkheion-* 注解，然后：
arkheion cluster auto check   # 静态检查：ID 冲突、pod 环、函数调用环
arkheion cluster auto         # 一键完成 deploy + link + mount
```

**完成！** 你已经拥有一个完全编排的、多签治理的、可热插拔的 DeFi 后端。 🎉

---

## 🏗️ 核心特性

### 模块化架构
```
# 以前（单体合约）
contract GodContract { /* 5,000+ 行代码，无法审计 */ }

# 现在（Arkheion）
LendingPool  ──┐
PriceOracle  ──┼── Cluster（治理、链接、可升级）
Liquidation  ──┘
```
- ✅ 每个合约只负责一件事
- ✅ 独立部署与升级周期
- ✅ 更小的字节码单元 = 更低的 Gas 成本

### 声明式自动装配

在合约源码顶部添加 `@arkheion-*` 注解，CLI 自动处理剩余一切：

```solidity
// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive
// @arkheion-auto yes
contract TradeEngine is normalTemplate { ... }
```

```bash
arkheion cluster auto check      # ID 冲突检测、pod 环分析、函数调用环检测
arkheion cluster auto            # 完整流水线：全部 deploy → 全部 link → 全部 mount
arkheion cluster auto --dry-run  # 预览执行计划，不执行任何链上操作
```

- ✅ 自动拓扑排序 — 按依赖顺序部署
- ✅ Pod 级环检测 — 自动延迟到 afterMount 补边
- ✅ 函数级调用环检测 — 跳过不安全的 pod link，提示开发者
- ✅ 与现有项目状态协调 — 已挂载的合约自动跳过

### 运行时动态链接
```bash
arkheion cluster link active 0xOracle... 2    # LendingPool 调用 Oracle
arkheion cluster link passive 0xOracle... 2   # Oracle 接受来自 LendingPool 的调用
```
- ✅ 永远不需要硬编码地址
- ✅ 调用时双向鉴权校验
- ✅ 通过 `arkheion cluster graph` 实现拓扑可视化

### 零停机热替换升级
```bash
arkheion cluster upgrade --id 2 --contract PriceOracleV2
# 旧预言机被卸载，新合约无缝接管 —— 依赖方零感知
```
- ✅ 依赖方动态解析最新地址
- ✅ 链路拓扑在升级后完整保留
- ✅ 执行前需要多签审批

### 多签治理
```bash
arkheion wallet submit --to 0xCluster... --data 0x... --yes
arkheion wallet confirm 0 --yes
arkheion wallet execute 0 --yes
```
- ✅ 所有拓扑变更必须通过阈值签名
- ✅ 所有侵入式钱包命令执行前均需确认 —— CI 中使用 `--yes` 跳过
- ✅ `wallet list` / `wallet info` 显示**实时有效确认数**（移除所有者后仍准确）
- ✅ 内置提案系统（增减签名者、修改阈值）
- ✅ 从第一天起即满足 DAO 标准

---

## 📊 架构设计

### 三层架构

| 层级 | 组件 | 职责 |
|------|------|------|
| **CLI 层** | `arkheion-cli` | 面向开发者的自动化终端 |
| **编排层** | `ClusterManager` | 服务注册中心、挂载表、Operator 管理 |
| | `EvokerManager` | 依赖图、主动/被动链路鉴权 |
| | `ProxyWallet` | 多签门限治理闸门 |
| **业务层** | `NormalTemplate` pods | 隔离的、可挂钩的、职责单一的合约 |

### 安全模型

每次跨合约调用都会经过**零信任校验链**：

```
Pod A 调用 Pod B
  → Pod B 的修饰器查询 EvokerManager
    → EvokerManager 验证 A 是否在 B 的被动白名单中
      → 该白名单由 ProxyWallet 多签设置
        → 调用通过  ✅
        → 或立即回滚  ❌
```

无地址伪造。无未授权访问。无例外。

---

## 🛠️ 命令速查

| 命令 | 说明 |
|------|------|
| `arkheion init` | 初始化项目 + Hardhat + 配置 |
| `arkheion deploy --contract <Name> [--cleanup <keep\|soft\|hard>] [--yes]` | 编译并部署 NormalTemplate 合约 |
| `arkheion cluster init [--cleanup <keep\|soft\|hard>] [--yes]` | 部署编排骨架 |
| `arkheion cluster mount <id> <name>` | 将合约注册到集群 |
| `arkheion cluster unmount <id>` | 从集群卸载合约 |
| `arkheion cluster upgrade --id <id> --contract <Name> [--cleanup <keep\|soft\|hard>] [--yes]` | 热替换合约版本 |
| `arkheion cluster link <type> <addr> <id>` | 创建主动/被动依赖 |
| `arkheion cluster unlink <type> <addr> <id>` | 移除依赖 |
| `arkheion cluster auto check` | 静态检查：ID 冲突、pod 环、函数调用环（不写链） |
| `arkheion cluster auto [--dry-run] [--cleanup <keep\|soft\|hard>] [--yes]` | 声明式自动装配：deploy + link + mount |
| `arkheion cluster rollback --id <contractId> [--generation <n>] [--dry-run] [--yes]` | 回滚到历史 `deprecated` 版本 |
| `arkheion cluster history --id <contractId>` | 查看指定 contractId 的版本历史 |
| `arkheion cluster graph` | 生成 Mermaid 拓扑图 |
| `arkheion cluster list mounted` | 列出所有已挂载合约 |
| `arkheion cluster info <id>` | 查看合约元数据 |
| `arkheion cluster choose <addr>` | 设置工作上下文 |
| `arkheion cluster operator add/remove <addr>` | 管理集群操作员 |
| `arkheion wallet submit --to <addr> --data <hex> [--yes]` | 提交交易（需确认） |
| `arkheion wallet confirm <txIndex> [--yes]` | 确认交易（需确认） |
| `arkheion wallet execute <txIndex> [--yes]` | 执行交易（需确认） |
| `arkheion wallet revoke <txIndex> [--yes]` | 撤销确认（需确认） |
| `arkheion wallet list [--pending]` | 列出交易，显示**实时有效确认数** |
| `arkheion wallet info <txIndex>` | 查看交易详情，显示实时确认数 |
| `arkheion wallet owners` | 查看签名者与阈值 |
| `arkheion wallet propose add-owner <addr> [--yes]` | 提议添加所有者（需确认） |
| `arkheion wallet propose remove-owner <addr> [--yes]` | 提议移除所有者（需确认） |
| `arkheion wallet propose change-threshold <N> [--yes]` | 提议修改阈值（需确认） |
| `arkheion normal right set/remove` | ABI 级权限控制 |
| `arkheion normal get modules <type>` | 查询已链接模块 |

---

## 🆚 方案对比

| 特性 | Hardhat（原生） | OpenZeppelin 升级 | Diamond (EIP-2535) | **Arkheion** |
|------|-----------------|-------------------|--------------------|----------|
| 模块化合约 | ❌ | ❌ | ✅（facets） | ✅（pods） |
| 运行时链接 | ❌ | ❌ | ❌ | ✅ |
| 依赖关系图 | ❌ | ❌ | ❌ | ✅ |
| 热替换升级 | ❌ | ✅（proxy） | ✅（facets） | ✅（mount） |
| 多签治理 | ❌ | ❌ | ❌ | ✅ 内置 |
| 拓扑可视化 | ❌ | ❌ | ❌ | ✅ Mermaid |
| 声明式自动装配 | ❌ | ❌ | ❌ | ✅ |
| 环检测（pod + 函数级） | ❌ | ❌ | ❌ | ✅ |
| CLI 自动化 | 部分 | 部分 | ❌ | ✅ 完整 |
| 零信任鉴权 | ❌ | ❌ | ❌ | ✅ |

---

## 📈 项目统计

```
总代码行数:     8,500+
  Solidity:    1,175  (4 个核心合约)
  JavaScript:  5,200+ (20 条 CLI 命令 + 自动装配子系统)
  文档:        1,800+
  测试:        325 单元测试（Jest，全部通过）
```

---

## 🤝 贡献

欢迎贡献代码！请在提交 PR 前阅读 [贡献指南](CONTRIBUTING.md)。

```bash
git clone https://github.com/Steve65535/arkheion-cli.git
cd arkheion-cli
npm install
npm test
```

---

## 📄 许可证

[Apache-2.0](LICENSE) © Steve65535

---

<p align="center">
  <sub>Arkheion — 像搭微服务一样搭建智能合约。</sub>
</p>
