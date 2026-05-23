# Arkheion — Paper Outline / 论文大纲

> Bilingual reference document for presentation use.
> 中英文双语参考文档，供 Presentation 使用。

---

## Recommended Venues / 推荐发表目标

| Tier | Venue | Track |
|------|-------|-------|
| Top | ACM CCS / IEEE S&P / USENIX Security | Security & Systems |
| **Recommended** | **FSE / ICSE / ASE** | **Software Engineering — best fit** |
| Recommended | FC (Financial Cryptography) | Blockchain Systems |
| Journal | IEEE TSE / ACM TOSEM | Extended version |
| Fallback | IEEE Blockchain / ICDCS | Blockchain track |

---

## Candidate Titles / 候选标题

**EN (Systems framing):**
> Arkheion: A Declarative Microservice Framework for On-Chain Smart Contract Orchestration

**EN (Analysis framing):**
> Pod-Aware Dependency Analysis and Automated Assembly for Modular Smart Contract Systems

**EN (Upgrade framing):**
> From Monolith to Microservices: Version-Governed Hot-Swap Upgrades for Smart Contract Clusters

**中文（系统方向）：**
> Arkheion：面向链上智能合约编排的声明式微服务框架

**中文（分析方向）：**
> 面向模块化智能合约系统的 Pod 感知依赖分析与自动化部署

**中文（升级方向）：**
> 从单体到微服务：面向智能合约集群的版本治理热替换升级机制

---

---

# English Version

## Paper Outline

### 1. Introduction
- 1.1 Problem Statement
  - Smart contracts are monolithic, statically linked, and brittle to upgrade
  - Protocol complexity has grown to 50+ interdependent contracts; no tooling exists for orchestration
  - Existing patterns (proxy, beacon, Diamond) are storage-coupled and governance-light
- 1.2 Motivation
  - DeFi protocols need Kubernetes-like orchestration: modular, hot-swappable, governed
  - A declarative, annotation-driven assembly model can eliminate entire classes of deployment bugs
- 1.3 Contributions
  1. **Pod abstraction**: a novel runtime dependency model (activePod / passivePod) that externalizes contract relationships without hardcoded addresses
  2. **Dual-level cycle detection**: distinguishes pod-level cycles (auto-resolved via deferred linking) from function-level cycles (unsafe patterns, skipped with diagnostics)
  3. **Declarative auto-assembly pipeline**: annotation-driven, topology-sorted, one-command deployment for multi-contract systems
  4. **Version governance & rollback**: generation counters + pod snapshots enable safe, address-agnostic rollback to any historical version
- 1.4 Paper Organization

---

### 2. Background & Motivation
- 2.1 Smart Contract Limitations
  - No dynamic linking at the language level
  - Upgrades require redeployment of dependents or complex proxy indirection
  - No built-in governance for topology mutations
- 2.2 Existing Upgrade Approaches and Their Shortcomings
  - **EIP-1967 Transparent Proxy**: storage layout coupling, admin key risk
  - **EIP-2535 Diamond (Multi-Facet Proxy)**: shared storage, facets not independently versioned
  - **UUPS**: upgrade logic in implementation, initialization attack surface
  - **OpenZeppelin Upgrades**: no dependency graph, no rollback
- 2.3 Running Example
  - A 3-contract DeFi system (TradeEngine → PriceFeed → Vault) requiring a hot-swap upgrade to TradeEngine while PriceFeed stays live

---

### 3. System Design
- 3.1 Core Abstraction: The Pod System
  - `activePod`: contracts this contract calls (outgoing dependencies)
  - `passivePod`: contracts that call this contract (incoming dependencies)
  - `whetherMounted` lock flag: pod edges immutable while mounted
  - O(1) add/remove/verify via dual-mapping in AddressPod library
- 3.2 Cluster Topology Model
  - **ClusterManager**: central registry (id → name → address), operator permission model
  - **EvokerManager**: bidirectional dependency graph (adjacency list + mounted mapping)
  - **NormalTemplate**: base contract for all business pods (provides pod storage + modifiers)
- 3.3 Contract Lifecycle
  - `deploy` → `link (beforeMount)` → `mount (registerContract)` → `link (afterMount)` → `upgrade / rollback` → `unmount`
- 3.4 Multi-Sig Governance Model
  - MultiSigWallet: submit → confirm → execute → revoke
  - Governance proposals: addOwner, removeOwner, changeThreshold
  - All rootAdmin-level cluster mutations routed through multi-sig
- 3.5 Design Goals and Trade-offs
  - Modularity vs. gas cost (per-edge on-chain storage)
  - Declarative simplicity vs. static analysis precision
  - Rollback safety vs. pod snapshot staleness

---

### 4. Declarative Auto-Assembly
- 4.1 Annotation Language
  - `@Arkheion-id <N>`: unique cluster ID
  - `@Arkheion-active <id,...>`: outgoing dependency IDs
  - `@Arkheion-passive <id,...>`: incoming dependency IDs
  - `@Arkheion-auto yes|no`: opt in/out of auto-assembly
- 4.2 Static Analysis Pipeline
  - 4.2.1 Pod-Level Dependency Graph
    - DFS cycle detection with 3-color marking (O(V+E))
    - Full cycle extraction (not just back-edge detection)
  - 4.2.2 Function-Level Cross-Contract Call Analysis
    - Pattern: `IFoo(addr).method()` parsed from Solidity source
    - Interface-to-contract mapping via naming convention (`IFoo → Foo`)
    - Interprocedural DFS on function-level call graph
  - 4.2.3 Minimal Cycle-Breaking Strategy
    - Each function cycle resolved by removing exactly one cross-contract pod edge (the last edge in the cycle path)
    - Minimizes topology disruption
- 4.3 Assembly Pipeline (7 phases)
  1. Analyze: scan → parse → ID conflict detection → pod graph → function graph
  2. Reconcile: compare annotations vs. `project.json` state (deploy/link/mount per contract)
  3. Compile: `npx hardhat compile`
  4. Deploy all: topological order (all addresses must exist before linking)
  5. Link all (beforeMount): skip `funcCycleEdgeSet`; defer edges whose target is not yet registered
  6. Mount all: `ClusterManager.registerContract()` → `EvokerManager.mount()`
  7. AfterMount (3 ordered sub-phases):
     - a. Deferred links (targets now registered)
     - b. Pod-cycle edges (not in funcCycleEdgeSet)
     - c. Deduplication check against `completedSteps` to prevent "Module exists" revert
- 4.4 Deferred Linking and Deduplication Invariants
  - Before sending any afterMount cycle edge, check both `afterMount:*` and `link:*` keys in `completedSteps`

---

### 5. Version Governance & Rollback
- 5.1 Generation Counter Semantics
  - `generation`: per-contractId version counter, incremented only when contractId is bound
  - `deploySeq`: global monotonic deploy sequence (every deploy, including unregistered)
  - Same address remounted after unmount reuses existing generation (no inflation)
- 5.2 Pod Snapshot Mechanism
  - After every on-chain operation (mount, link, unlink, upgrade), CLI reads `getAllActiveModules()` / `getAllPassiveModules()` and writes contractId-only snapshot to `project.json`
  - Snapshot contains contractId references, not addresses (address-agnostic)
- 5.3 Rollback Workflow
  1. Validate target: `status=deprecated`, bytecode exists on-chain
  2. Save checkpoint to `rollback-checkpoint.json`
  3. Unmount current: `ClusterManager.deleteContract()` → `EvokerManager.unmount()`
  4. Mount target: `ClusterManager.registerContract()`
  5. Restore pod edges from snapshot via `addActivePodAfterMount()` / `addPassivePodAfterMount()`
  6. Update `project.json`; delete checkpoint on success
  7. Write `rollback-report.json` on partial failures
- 5.4 Resilience Properties
  - Pod addresses resolved from live ClusterManager registry at execution time
  - If a dependency was upgraded during the rollback window, the registry lookup adapts automatically
  - `--dry-run` prints the full plan without any chain operations

---

### 6. Implementation
- 6.1 Smart Contract Layer (Solidity, ~1,200 LOC)
  - 6 contracts: ClusterManager (264), EvokerManager (205), NormalTemplate (200), MultiSigWallet (347), ProxyWallet (102), AddressPod (115)
- 6.2 CLI Toolchain (Node.js/ethers.js v6, ~15,000 LOC)
  - Tree-structured command parser, 43 command handlers
  - Chain abstraction layer (provider, signer with NonceManager, deploy, tx)
- 6.3 AddressPod: O(1) Pod Operations
  - Dual mapping: `contractId → index+1` and `address → contractId`
  - Swap-pop removal maintains O(1) amortized complexity
- 6.4 Transaction Safety
  - `getSigner()` returns `NonceManager`-wrapped wallet (no double-wrapping)
  - Confirmation gate (`--yes` bypass for CI), stdin EOF resolves as `false`
  - File logger intercepts all console output to `logs/<YYYY-MM-DD>.log`

---

### 7. Evaluation
- 7.1 Experimental Setup
  - Local Hardhat network + public testnet (Sepolia)
  - Test suite: 382 unit + integration tests (100% pass rate)
- 7.2 Correctness Evaluation
  - 32 test files covering parser, graph algorithms, reconciler, rollback, cleanup, version governance
  - Cycle detection: true positive / false positive analysis on synthetic dependency graphs
- 7.3 Performance Evaluation
  - Auto-assembly time vs. manual deployment for N = {5, 10, 20, 43} contracts
  - Rollback latency (checkpoint → on-chain confirmation)
- 7.4 Gas Cost Analysis
  - `registerContract()` (mount), `mountSingle()` (afterMount link), `deleteContract()` (unmount)
  - Comparison with equivalent Diamond facet registration
- 7.5 Upgrade Throughput
  - Hot-swap latency (old unmount + new mount + pod restore) as a function of pod count

---

### 8. Security Analysis
- 8.1 Threat Model
  - Adversary capabilities: malicious operator, compromised key, reentrancy attacker
  - Assets: registry integrity, pod topology, upgrade authority
- 8.2 Privilege Escalation Prevention
  - ProxyWallet: hierarchical levels; no principal can grant ≥ own level
  - rootAdmin is immutable; operator set managed via multi-sig
- 8.3 Reentrancy: Coverage and Gaps
  - `NoReentryGuard` applied to `universalCall()` and governance operations
  - EvokerManager lock-and-release ordering prevents neighbor lock conflicts
- 8.4 Path Safety in Cleanup
  - All ancestor directories checked for symlinks (prevents directory-level escape)
  - Case-insensitive file lookup on case-sensitive filesystems
- 8.5 Limitations and Assumptions
  - Interface-to-contract mapping is naming-convention-based (not AST-level)
  - `podSnapshot` can be stale if an out-of-band upgrade occurs between operations

---

### 9. Related Work
- 9.1 Smart Contract Upgrade Patterns
  - Transparent Proxy (EIP-1967), Diamond (EIP-2535), UUPS, Beacon Proxy
  - Key distinction: Arkheion uses runtime address registration, not storage delegation
- 9.2 Smart Contract Composition
  - Libraries (stateless), interfaces (type-only), inheritance (static coupling)
  - Arkheion provides runtime, governed, versioned composition
- 9.3 Static Analysis for Solidity
  - Slither (dataflow), Securify (semantic patterns), MadMax (decompilation)
  - Arkheion's function-level analysis is lightweight and convention-driven (not sound)
- 9.4 Container Orchestration as Conceptual Analogy
  - Kubernetes: Pod → NormalTemplate, ClusterManager → API Server, EvokerManager → kube-proxy
  - Key differences: on-chain immutability, gas cost per operation, consensus latency

---

### 10. Conclusion & Future Work
- Summary of contributions
- Future directions:
  - Formal verification of pod invariants (TLA+ / Coq)
  - AST-based Solidity interprocedural analysis (beyond naming convention)
  - Cross-chain cluster support (multi-network pod linking)
  - Gas optimization: batch mount/link transactions
  - IDE plugin for annotation authoring and static check feedback

---
---

# 中文版本

## 论文大纲

### 1. 引言
- 1.1 问题陈述
  - 智能合约是单体式、静态链接的，难以升级
  - 协议复杂度已达 50+ 个相互依赖的合约，缺乏编排工具
  - 现有模式（代理、Beacon、Diamond）与存储强耦合，治理机制薄弱
- 1.2 动机
  - DeFi 协议需要类 Kubernetes 的编排能力：模块化、可热替换、有治理
  - 基于注解的声明式部署模型可以消除整类部署错误
- 1.3 主要贡献
  1. **Pod 抽象**：一种新颖的运行时依赖模型（activePod / passivePod），在不硬编码地址的情况下外化合约间关系
  2. **双层环检测**：区分 Pod 级环（通过延迟链接自动解决）与函数级环（不安全模式，跳过并输出诊断信息）
  3. **声明式自动装配流水线**：注解驱动、拓扑排序、一键部署多合约系统
  4. **版本治理与回滚**：代次计数器 + Pod 快照，支持对任意历史版本进行安全的、地址无关的回滚
- 1.4 论文结构

---

### 2. 背景与动机
- 2.1 智能合约的局限性
  - 语言层面缺乏动态链接机制
  - 升级需要重新部署依赖方或引入复杂的代理间接层
  - 拓扑变更缺乏内置治理机制
- 2.2 现有升级方案及其不足
  - **EIP-1967 透明代理**：存储布局耦合，管理员密钥风险
  - **EIP-2535 Diamond（多切面代理）**：共享存储，切面无法独立版本化
  - **UUPS**：升级逻辑在实现合约中，存在初始化攻击面
  - **OpenZeppelin Upgrades**：无依赖图，无回滚机制
- 2.3 引例
  - 一个三合约 DeFi 系统（TradeEngine → PriceFeed → Vault），需在 PriceFeed 保持在线的情况下对 TradeEngine 进行热替换升级

---

### 3. 系统设计
- 3.1 核心抽象：Pod 系统
  - `activePod`：本合约调用的合约（出向依赖）
  - `passivePod`：调用本合约的合约（入向依赖）
  - `whetherMounted` 锁标志：已挂载时 Pod 边不可修改
  - 通过 AddressPod 库的双映射实现 O(1) 增删查验
- 3.2 集群拓扑模型
  - **ClusterManager**：中央注册表（id → name → address），运营者权限模型
  - **EvokerManager**：双向依赖图（邻接表 + mounted 映射）
  - **NormalTemplate**：所有业务 Pod 的基类（提供 Pod 存储 + 修饰符）
- 3.3 合约生命周期
  - `部署` → `链接（挂载前）` → `挂载（registerContract）` → `链接（挂载后）` → `升级 / 回滚` → `卸载`
- 3.4 多签治理模型
  - MultiSigWallet：提交 → 确认 → 执行 → 撤销
  - 治理提案：addOwner、removeOwner、changeThreshold
  - 所有 rootAdmin 级别的集群变更均通过多签路由
- 3.5 设计目标与权衡
  - 模块化 vs. Gas 成本（每条边链上存储）
  - 声明式简洁性 vs. 静态分析精度
  - 回滚安全性 vs. Pod 快照陈旧性

---

### 4. 声明式自动装配
- 4.1 注解语言
  - `@Arkheion-id <N>`：唯一集群 ID
  - `@Arkheion-active <id,...>`：出向依赖 ID
  - `@Arkheion-passive <id,...>`：入向依赖 ID
  - `@Arkheion-auto yes|no`：是否纳入自动装配
- 4.2 静态分析流水线
  - 4.2.1 Pod 级依赖图
    - 三色标记 DFS 环检测（O(V+E)）
    - 完整环提取（不仅检测回边）
  - 4.2.2 函数级跨合约调用分析
    - 从 Solidity 源码解析 `IFoo(addr).method()` 模式
    - 通过命名约定将接口映射到合约（`IFoo → Foo`）
    - 在函数级调用图上进行过程间 DFS
  - 4.2.3 最小环破策略
    - 每个函数级环通过删除恰好一条跨合约 Pod 边来解决（路径中的最后一条边）
    - 最小化对拓扑结构的影响
- 4.3 装配流水线（7 个阶段）
  1. 分析：扫描 → 解析 → ID 冲突检测 → Pod 图 → 函数图
  2. 协调：对比注解与 `project.json` 状态，确定每个合约的动作（部署/链接/挂载）
  3. 编译：`npx hardhat compile`
  4. 全量部署：按拓扑顺序（链接前所有地址必须存在）
  5. 全量链接（挂载前）：跳过 `funcCycleEdgeSet`；推迟目标尚未注册的边
  6. 全量挂载：`ClusterManager.registerContract()` → `EvokerManager.mount()`
  7. 挂载后处理（3 个有序子阶段）：
     - a. 推迟的链接（目标现已注册）
     - b. Pod 环边（不在 funcCycleEdgeSet 中的）
     - c. 对 `completedSteps` 进行去重检查，防止"Module exists"回滚
- 4.4 延迟链接与去重不变量
  - 发送任何挂载后环边之前，同时检查 `completedSteps` 中的 `afterMount:*` 和 `link:*` 键

---

### 5. 版本治理与回滚
- 5.1 代次计数器语义
  - `generation`：per-contractId 版本计数器，仅在绑定 contractId 时递增
  - `deploySeq`：全局单调部署序号（每次部署均递增，包括未注册部署）
  - 同一地址在卸载后重新挂载时复用已有代次（不通货膨胀）
- 5.2 Pod 快照机制
  - 每次链上操作（挂载、链接、取消链接、升级）后，CLI 读取 `getAllActiveModules()` / `getAllPassiveModules()` 并将仅含 contractId 的快照写入 `project.json`
  - 快照使用 contractId 引用，不含地址（地址无关）
- 5.3 回滚流程
  1. 验证目标：`status=deprecated`，字节码在链上存在
  2. 保存检查点至 `rollback-checkpoint.json`
  3. 卸载当前版本：`ClusterManager.deleteContract()` → `EvokerManager.unmount()`
  4. 挂载目标版本：`ClusterManager.registerContract()`
  5. 从快照恢复 Pod 边：`addActivePodAfterMount()` / `addPassivePodAfterMount()`
  6. 更新 `project.json`；成功后删除检查点
  7. 部分失败时写入 `rollback-report.json`
- 5.4 弹性特性
  - Pod 地址在执行时从 ClusterManager 注册表实时解析
  - 若依赖项在回滚窗口期间已升级，注册表查询可自动适配
  - `--dry-run` 打印完整计划而不执行任何链上操作

---

### 6. 实现
- 6.1 智能合约层（Solidity，约 1,200 行）
  - 6 个合约：ClusterManager (264)、EvokerManager (205)、NormalTemplate (200)、MultiSigWallet (347)、ProxyWallet (102)、AddressPod (115)
- 6.2 CLI 工具链（Node.js / ethers.js v6，约 15,000 行）
  - 树状结构命令解析器，43 个命令处理器
  - 链抽象层（provider、带 NonceManager 的 signer、deploy、tx）
- 6.3 AddressPod：O(1) Pod 操作
  - 双映射：`contractId → index+1` 与 `address → contractId`
  - 交换弹出删除，保持 O(1) 摊销复杂度
- 6.4 交易安全性
  - `getSigner()` 返回 `NonceManager` 包装的钱包（不重复包装）
  - 确认门控（`--yes` 用于 CI 绕过），stdin EOF 解析为 `false`
  - 文件日志拦截所有控制台输出至 `logs/<YYYY-MM-DD>.log`

---

### 7. 评估
- 7.1 实验设置
  - 本地 Hardhat 网络 + 公共测试网（Sepolia）
  - 测试套件：382 个单元测试 + 集成测试（通过率 100%）
- 7.2 正确性评估
  - 32 个测试文件，覆盖解析器、图算法、协调器、回滚、清理、版本治理
  - 环检测：在合成依赖图上进行真阳性/假阳性分析
- 7.3 性能评估
  - 自动装配耗时 vs. 手动部署，N = {5, 10, 20, 43} 个合约
  - 回滚延迟（检查点 → 链上确认）
- 7.4 Gas 成本分析
  - `registerContract()`（挂载）、`mountSingle()`（挂载后链接）、`deleteContract()`（卸载）
  - 与等效 Diamond 切面注册的对比
- 7.5 升级吞吐量
  - 热替换延迟（旧合约卸载 + 新合约挂载 + Pod 恢复）随 Pod 数量的变化

---

### 8. 安全分析
- 8.1 威胁模型
  - 攻击者能力：恶意运营者、密钥泄露、重入攻击者
  - 保护资产：注册表完整性、Pod 拓扑、升级权限
- 8.2 权限提升防护
  - ProxyWallet：层级权限；任何主体均无法授予 ≥ 自身级别的权限
  - rootAdmin 不可变；运营者集合通过多签管理
- 8.3 重入：覆盖范围与缺口
  - `NoReentryGuard` 应用于 `universalCall()` 及治理操作
  - EvokerManager 的加锁-释放顺序防止邻居锁冲突
- 8.4 清理操作中的路径安全性
  - 检查所有祖先目录是否为符号链接（防止目录级逃逸）
  - 大小写不敏感的文件查找（适配大小写敏感文件系统）
- 8.5 局限性与假设
  - 接口到合约的映射基于命名约定（而非 AST 级别）
  - 若两次操作之间发生带外升级，`podSnapshot` 可能过时

---

### 9. 相关工作
- 9.1 智能合约升级模式
  - 透明代理（EIP-1967）、Diamond（EIP-2535）、UUPS、Beacon 代理
  - 核心区别：Arkheion 使用运行时地址注册，而非存储委托
- 9.2 智能合约组合
  - 库（无状态）、接口（仅类型）、继承（静态耦合）
  - Arkheion 提供运行时、受治理、可版本化的组合
- 9.3 Solidity 静态分析
  - Slither（数据流）、Securify（语义模式）、MadMax（反编译）
  - Arkheion 的函数级分析是轻量级、基于约定的（非 sound 分析）
- 9.4 容器编排作为概念类比
  - Kubernetes：Pod → NormalTemplate，ClusterManager → API Server，EvokerManager → kube-proxy
  - 关键差异：链上不可变性、每次操作的 Gas 成本、共识延迟

---

### 10. 结论与未来工作
- 贡献总结
- 未来方向：
  - Pod 不变量的形式化验证（TLA+ / Coq）
  - 基于 AST 的 Solidity 过程间分析（超越命名约定）
  - 跨链集群支持（多网络 Pod 链接）
  - Gas 优化：批量挂载/链接交易
  - IDE 插件，支持注解编写和静态检查反馈

---

## Key Talking Points for Presentation / Presentation 核心要点

### The "Elevator Pitch" (30 seconds)
> "Arkheion brings Kubernetes-style orchestration to smart contracts. Instead of hardcoding addresses and redeploying entire protocols, you annotate your contracts, run one command, and the system automatically detects dependency cycles, deploys in topological order, and links everything on-chain — with built-in versioned rollback to any historical state."

### 电梯演讲（30 秒）
> "Arkheion 将 Kubernetes 式编排带入智能合约领域。不再需要硬编码地址、不再需要重新部署整个协议——只需在合约中添加注解，运行一条命令，系统自动检测依赖环、按拓扑顺序部署、在链上完成所有链接，并内置对任意历史版本的回滚能力。"

### Three Slides to Nail / 三张必须讲好的幻灯片

1. **Problem Slide**: Show a diagram of a 5-contract DeFi system with hardcoded addresses everywhere → one upgrade requires touching 4 files and 3 redeployments
2. **Solution Slide**: Same system with Pod annotations → `arkheion cluster auto` → all on-chain in one command
3. **Algorithm Slide**: The dual-level cycle detection — show one pod-cycle (auto-resolved) vs. one function-cycle (skipped with warning), make it concrete with a 3-node example

1. **问题幻灯片**：展示一个 5 合约 DeFi 系统，到处是硬编码地址——升级一个合约需要修改 4 个文件并重新部署 3 次
2. **解决方案幻灯片**：同一系统加上 Pod 注解 → `arkheion cluster auto` → 一条命令完成所有链上操作
3. **算法幻灯片**：双层环检测——展示一个 Pod 环（自动解决）vs. 一个函数环（跳过并警告），用 3 节点示例具体说明
