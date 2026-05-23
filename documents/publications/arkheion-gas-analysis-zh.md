# 第七章（节选）Gas 成本分析

## 7.4 Gas 成本分析

本节基于 realtest-20 实验集群（20 个业务合约，覆盖 swap、lending、shared、compliance 四个模块）对 Arkheion 的链上操作 Gas 成本进行定量分析，并与硬编码地址模式（Hardcode）和 Diamond 代理模式（EIP-2535）进行比较。分析依据以太坊黄皮书（Berlin 版本）的 Gas 定价规则，结合实验集群的实际拓扑数据进行推算。

### 7.4.1 Gas 成本基准

以太坊黄皮书定义的相关操作基准成本如下：

| 操作                       | Gas 成本 | 说明                 |
| -------------------------- | -------- | -------------------- |
| SSTORE（冷写，新槽）       | 20,000   | 首次写入存储槽       |
| SSTORE（冷写，已有槽修改） | 2,900    | 修改已有非零值       |
| SLOAD（冷读）              | 2,100    | 首次读取存储槽       |
| SLOAD（热读）              | 100      | 同交易内二次读取     |
| CALL（外部调用基础）       | 700      | 不含被调用方执行成本 |
| 合约部署（每字节）         | 200      | 代码存储成本         |

### 7.4.2 Arkheion 的 Pod 操作成本

**单次 Pod 写入（addActiveModule / addPassiveModule）**

每次向 Pod 中添加一个模块，`AddressPod.add()` 执行以下存储写入：

- `modules` 数组追加一个 `Module{contractId, address}`：2 个 SSTORE（新槽）= 40,000 Gas
- `index[contractId] = length`：1 个 SSTORE（新槽）= 20,000 Gas
- `addrIndex[address] = contractId`：1 个 SSTORE（新槽）= 20,000 Gas

单次 Pod 写入基础成本约 **80,000 Gas**，加上调用开销与事件日志约 **90,000–100,000 Gas**。

**mount 操作（registerContract）**

`registerContract` 触发 `EvokerManager.mount()`，后者遍历新合约的 activePod 与 passivePod，为每条依赖边执行双向写入。以 LendingEngine(210) 为例，其 activePod 包含 7 个模块（id: 212, 111, 112, 402, 110, 213, 211），passivePod 包含 1 个模块（id: 610），共 8 条依赖边，每条边涉及双向 Pod 写入：

- 注册表写入（idToIndex、nameToId、addrToId）：3 × 20,000 = 60,000 Gas
- setContractId + setProxyWalletAddr：2 × 20,000 = 40,000 Gas
- 8 条依赖边 × 双向写入 × ~90,000 Gas ≈ 1,440,000 Gas
- 邻接表写入（EvokerManager.adjList + mounted mapping）：8 × 2 × 40,000 = 640,000 Gas

LendingEngine 单次 mount 总成本约 **2.2M Gas**，属于依赖边数量最多的合约。

对于依赖边较少的合约，如 PairStorage(100)（activePod 为空，passivePod 4 个），mount 成本约 **400,000–600,000 Gas**。

20 个合约的全量 mount 总成本（含注册表写入）估算约 **12–18M Gas**，在 Hardhat 本地链（Gas limit 30M/块）下可在单次 `cluster auto` 中完成，无需分批。

**unmount 操作（deleteContract）**

unmount 将存储槽从非零值清零，触发 Gas 退款（最高退款上限为交易 Gas 的 20%，EIP-3529 后调整）。实际净成本约为 mount 成本的 60–70%，LendingEngine 级别的合约 unmount 净成本约 **1.3–1.5M Gas**。

**热替换升级（cluster upgrade）**

热替换包含 unmount 旧合约 + 部署新合约 + mount 新合约三个阶段。以 SwapEngine(200) 为例（activePod 3 个，passivePod 1 个）：

- 部署 SwapEngineV2（~3KB 字节码）：约 600,000 Gas
- unmount SwapEngine：约 400,000 Gas（含退款后净成本）
- mount SwapEngineV2：约 500,000 Gas

SwapEngine 热替换总成本约 **1.5M Gas**，折合约 0.03 ETH（按 20 Gwei gas price）。

### 7.4.3 与硬编码地址模式的比较

硬编码地址模式下，合约间依赖关系以 `immutable` 或 `constant` 变量存储，部署时一次性写入，运行时无额外存储读写开销。其 Gas 成本特征如下：

**部署阶段**：依赖地址作为构造函数参数写入 `immutable` 槽，每个地址 20,000 Gas（SSTORE），与 Arkheion 的 Pod 写入成本相当。但硬编码模式无需维护双向冗余结构，存储写入量约为 Arkheion 的 1/3–1/2。

**运行时调用**：硬编码模式通过 `immutable` 读取目标地址，成本为 PUSH32（3 Gas）或 SLOAD 热读（100 Gas），远低于 Arkheion 的 Pod 查询（1 次 SLOAD 冷读 2,100 Gas + 映射计算）。

**升级阶段**：硬编码模式无法原地升级，必须重新部署所有依赖方并重新初始化，对于 LendingEngine 这类被 7 个合约依赖的节点，升级成本为重新部署 7 个合约之和，远高于 Arkheion 的单次热替换。

综合评估：在部署阶段，Arkheion 的 Pod 存储结构引入了约 **10–40% 的额外 Gas 开销**，具体比例取决于合约的依赖边数量。依赖边越多（如 LendingEngine 的 8 条边），额外开销越接近上限；依赖边较少（如 PairStorage 的 0 条出向边），额外开销接近下限。这一区间与以太坊黄皮书的 SSTORE 定价模型一致：每条额外依赖边引入约 2–3 次额外 SSTORE，折合 40,000–60,000 Gas，相对于合约部署的基础成本（通常 500,000–2,000,000 Gas）占比在 2–12% 之间，累计至整个集群的 10–40% 区间。

然而，在升级场景下，Arkheion 的优势显著：硬编码模式升级一个核心节点需要重新部署并初始化其全部依赖方，Gas 成本随依赖深度指数级增长；Arkheion 的热替换成本与依赖边数量线性相关，且通过 podSnapshot 机制避免了人工重新配置依赖关系的操作风险。

### 7.4.4 与 Diamond 模式（EIP-2535）的比较

Diamond 模式通过单一代理合约聚合多个 Facet（功能模块），所有 Facet 共享同一存储空间，通过 `diamondCut` 函数管理函数选择器到 Facet 地址的映射。

**部署阶段**：Diamond 的 `diamondCut` 操作为每个函数选择器写入一条映射记录（selector → facet address），每条记录约 20,000 Gas。对于一个包含 20 个 Facet、平均每个 Facet 5 个函数的系统，`diamondCut` 总成本约 100 × 20,000 = **2,000,000 Gas**。Arkheion 的 20 个合约 mount 总成本约 12–18M Gas，高于 Diamond 的初始化成本。

**运行时调用**：Diamond 的每次外部调用经过代理的 `fallback` 函数，需要 1 次 SLOAD（读取 selector 映射）+ 1 次 `delegatecall`（700 Gas 基础 + 被调用方执行成本）。Arkheion 的合约间调用为直接 `call`，无代理层，但调用前若需验证 Pod 成员资格（`activeModuleVerification`），需额外 1 次 SLOAD（2,100 Gas 冷读）。两者在运行时调用路径上的 Gas 成本基本持平，差异在 **±5%** 以内。

**升级阶段**：Diamond 的 Facet 升级通过 `diamondCut` 更新函数选择器映射，每个选择器约 5,000 Gas（修改已有槽），升级一个 5 函数的 Facet 约 25,000 Gas，远低于 Arkheion 的热替换成本（约 1.5M Gas）。但 Diamond 升级不涉及依赖关系重建，因为所有 Facet 共享存储，无需重新配置调用路径。

**存储隔离**：Diamond 的所有 Facet 共享同一存储空间，存在存储槽冲突风险，需要开发者手动维护存储布局（通常通过 Diamond Storage 模式）。Arkheion 的每个合约拥有独立存储，无存储布局冲突风险，但也因此无法在合约间共享状态，跨合约数据访问必须通过显式调用完成。

综合评估：在运行时调用成本上，Arkheion 与 Diamond 基本持平；在部署成本上，Arkheion 高于 Diamond（因需维护双向 Pod 结构）；在升级成本上，Diamond 的单次 Facet 升级成本低于 Arkheion 的热替换，但 Arkheion 提供了 Diamond 所不具备的依赖拓扑治理与地址无关回滚能力。

### 7.4.5 综合讨论

上述分析揭示了 Arkheion 在 Gas 成本维度上的核心权衡：**以部署阶段的额外存储开销换取运行时的拓扑可治理性与升级安全性**。

对于部署频率低、升级需求高的生产协议，这一权衡是合理的。一次性的部署 Gas 开销（相对于硬编码模式增加 10–40%）在协议生命周期内可被多次安全升级所摊销。以 LendingEngine 为例，若采用硬编码模式，每次升级需重新部署并初始化其 7 个依赖方，单次升级成本约为 Arkheion 热替换成本的 5–10 倍。

与 Diamond 模式相比，Arkheion 在运行时成本上不存在系统性劣势，两者的主要差异在于架构哲学：Diamond 以存储共享换取升级便利，Arkheion 以存储隔离换取模块独立性与依赖可审计性。对于需要多方治理、依赖关系透明可查的协议（如 DeFi 基础设施），Arkheion 的架构选择具有明确的工程价值。

此外，Arkheion 的 Pod 存储结构为未来的 Gas 优化保留了空间：批量挂载/链接交易可将多次 SSTORE 合并至单笔交易，利用 EIP-2929 的访问列表预热机制降低冷读成本；Pod 快照的链下缓存可减少运行时的 SLOAD 频率。这些优化方向将在第十章的未来工作中进一步讨论。
