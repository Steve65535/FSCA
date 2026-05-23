# 第三章 声明式自动装配机制

## 3.1 注解语言设计

Arkheion 通过在 Solidity 源码注释中嵌入四条注解，将合约的集群身份与依赖关系以声明式方式表达：

`@arkheion-id <N>` 为合约指定集群内唯一的逻辑标识符，类型为无符号 32 位整数。该标识符在合约地址发生变化后保持不变，是版本治理与地址无关回滚的基础。

`@arkheion-active <id,...>` 声明本合约主动调用的合约 ID 列表，对应 activePod 的出向依赖。`@arkheion-passive <id,...>` 声明调用本合约的合约 ID 列表，对应 passivePod 的入向依赖。两者均接受逗号分隔的整数列表，空值表示无依赖。

`@arkheion-auto yes|no` 控制合约是否纳入自动装配流水线。设为 `no` 的合约将被扫描器跳过，不参与拓扑分析与链上操作。

注解以行注释形式嵌入，不引入任何新的语言构造，对编译器完全透明。一个典型的标注示例如下：

```solidity
// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive
// @arkheion-auto yes
contract TradeEngine is normalTemplate, NoReentryGuard { ... }
```

解析器（`auto/parser.js`）通过正则表达式从源码中提取上述四条注解。`@arkheion-auto yes` 是启用自动装配的前提条件；若启用后缺少 `@arkheion-id`，解析器返回错误而非静默跳过，以防止配置遗漏导致的装配不完整。

## 3.2 静态分析流程

静态分析由 `analyze.js` 统一编排，被 `cluster auto` 与 `cluster auto check` 共同复用，不执行任何链上操作。分析流程分为四个顺序阶段。

第一阶段，扫描器（`scanner.js`）递归遍历 `contracts/undeployed/` 与 `contracts/deployed/` 目录，筛选继承自 `normalTemplate` 的 `.sol` 文件，并排除框架核心合约（`normaltemplate.sol`、`clustermanager.sol` 等七个文件）。当同名合约同时出现在两个目录时，`undeployed` 版本优先，并记录警告。

第二阶段，解析器对每个扫描到的合约提取注解，跳过 `@arkheion-auto no` 的合约，对启用的合约进行 ID 冲突检测。若两个合约声明了相同的 `@arkheion-id`，分析立即终止并输出结构化诊断信息，包含冲突双方的合约名与文件路径。ID 冲突是唯一的致命错误，其余问题以警告形式记录。

第三阶段，基于解析结果构建 Pod 级依赖图并执行环检测与拓扑排序，详见 3.3 节。

第四阶段，基于源码构建函数级调用图并执行环检测，详见 3.4 节。

`analyze.js` 的返回值包含 `sorted`（拓扑排序后的合约 ID 序列）、`cycleEdges`（Pod 级环边集合）与 `funcCycleEdgeSet`（函数级环对应的需跳过 Pod 边集合），供后续装配阶段直接使用。

## 3.3 Pod 级依赖图与环检测

依赖图的边语义如下：若合约 A 的 `activePods` 或 `passivePods` 中包含合约 B 的 ID，则 B 必须先于 A 挂载，图中建立有向边 B→A。这一语义将"依赖关系"转化为"挂载顺序约束"，使拓扑排序的结果直接对应合法的挂载序列。

环检测采用 DFS 三色标记法（WHITE/GRAY/BLACK），时间复杂度 O(V+E)。节点初始为 WHITE；进入递归时标记为 GRAY；递归完成后标记为 BLACK。当 DFS 遍历到 GRAY 节点时，说明存在回边，即发现一个环。环的提取方式为从当前 DFS 栈中截取从环起点到当前节点的子序列，得到完整的环路径而非仅记录回边端点。

检测到环后，系统输出警告诊断并继续执行，不终止装配。拓扑排序（`topoSort`）采用 Kahn 算法：首先将所有环边从图中临时移除，在无环图上执行 BFS 入度归零排序，得到合法的挂载顺序；被移除的环边作为 `cycleEdges` 返回，留待挂载后阶段处理。

## 3.4 函数级跨合约调用分析

函数级分析的目标是识别合约之间存在相互调用的函数对，以发现潜在的无限递归风险。分析分三步进行。

第一步，从每个合约的源码中提取所有函数定义及其函数体。提取方式为正则匹配函数签名后，通过括号深度计数定位函数体的结束位置，支持任意嵌套结构。

第二步，构建接口到合约的映射。Solidity 惯例是在调用方源码中定义被调用方的接口，接口名通常为合约名加 `I` 前缀（如 `ITradeEngine` 对应 `TradeEngine`）。映射规则依次尝试：去掉 `I` 前缀后精确匹配、原名精确匹配、大小写不敏感匹配。

第三步，对每个函数体扫描跨合约调用模式 `IFoo(expr).method(...)`，其中括号内的参数支持任意嵌套（通过括号深度计数跳过）。识别到调用后，通过接口映射确定目标合约，在函数调用图中建立有向边 `CallerContract.callerFunc → TargetContract.targetFunc`。

函数调用图上的环检测同样采用 DFS 三色标记法，检测到的环以函数路径列表形式返回，如 `["A.foo", "B.bar", "C.baz", "A.foo"]`。

该分析方法属于轻量级启发式分析，不具备 soundness 保证：基于命名约定的接口映射可能漏报通过动态地址传入的调用，但不会产生误报。

## 3.5 最小破坏策略

函数级环检测完成后，需要确定哪些 Pod 边应当被永久跳过。朴素策略是跳过环中所有合约对之间的全部 Pod 边，但这会过度破坏拓扑结构。

Arkheion 采用最小破坏策略：对每个函数级环，仅移除一条 Pod 边来打破该环。具体做法是从环路径的末尾向前遍历，找到第一条跨合约边（即相邻两个节点属于不同合约的边），将其对应的 Pod 边加入 `funcCycleEdgeSet`，然后停止遍历。

以环路径 `["A.foo", "B.bar", "C.baz", "A.foo"]` 为例，跨合约边为 A→B、B→C、C→A，策略选择最后一条 C→A，仅跳过 Pod 边 `C_id → A_id`，A→B 与 B→C 对应的 Pod 边保持不变。

`funcCycleEdgeSet` 中的边在整个装配过程中被永久排除，既不在挂载前链接，也不在挂载后补边。这与 Pod 级环边的处理形成对比：Pod 级环边在挂载后阶段会被自动补链，而函数级环边则不会。

## 3.6 自动装配执行流程

装配流程由 `auto.js` 编排，分为六个阶段顺序执行。

**阶段一：预检（Pre-flight）。** 调用 `analyze()` 完成静态分析。若存在 ID 冲突或注解错误，立即终止并输出诊断；若存在函数级环，输出错误诊断但继续执行。

**阶段二：状态协调（Reconcile）。** 协调器（`reconciler.js`）将解析结果与 `project.json` 中的 `runningcontracts` 和 `unmountedcontracts` 对比，为每个合约确定操作集合：已挂载的合约标记为 `skip`，已部署未挂载的合约执行 `link + mount`，未部署的合约执行 `deploy + link + mount`。协调完成后，工具链还会向链上注册表查询实际状态，修正 `project.json` 与链上状态不一致的条目。

**阶段三：编译。** 调用 `npx hardhat compile` 编译所有合约，编译失败则终止。

**阶段四：全量部署。** 按拓扑排序顺序依次部署需要部署的合约。构造函数参数根据 ABI 自动推断：无参数时传空数组，一个参数时传 `clusterAddress`，两个参数时传 `clusterAddress` 与合约名。每次部署完成后立即将地址写入 `project.json` 并更新检查点，确保中断后可从已部署位置恢复。

**阶段五：全量链接（BeforeMount）。** 遍历所有需要链接的合约，对每条 Pod 边执行以下判断：若边在 `funcCycleEdgeSet` 中，永久跳过；若边在 `podCycleEdgeSet` 中，跳过（留待挂载后处理）；若目标合约尚未在链上注册（状态为 `undeployed` 或 `unmounted`），加入延迟链接队列；否则调用 `addActivePodBeforeMount` 或 `addPassivePodBeforeMount`。

**阶段六：全量挂载与挂载后处理。** 按拓扑顺序依次调用 `registerContract` 挂载所有合约。挂载完成后执行三个有序子阶段：首先处理延迟链接队列（目标合约此时已注册，可安全链接）；然后处理 Pod 级环边（调用 `addActivePodAfterMount` 或 `addPassivePodAfterMount`）；最后从链上读取每个新挂载合约的实际 Pod 状态，写入 `podSnapshot`。

装配完成后，若存在 Pod 级环、函数级环、跳过的链接或错误，将结果写入 `auto-report.json`。

## 3.7 幂等性与延迟链接保障

自动装配流程在设计上保证幂等性，支持在任意位置中断后恢复执行而不产生重复操作或状态不一致。

幂等性通过 `completedSteps` 集合与检查点文件（`auto-checkpoint.json`）共同实现。每个操作在执行前检查其步骤键是否已在集合中，若已存在则跳过；执行成功后将步骤键写入集合并持久化检查点。步骤键的命名规则为 `<操作类型>:<标识>`，例如 `deploy:TradeEngine`、`link:active:1->2`、`mount:2`、`afterMount:active:3->2`。

延迟链接的去重保障需要额外处理。延迟链接在挂载后阶段执行，其步骤键为 `link:active:depId->contractId`；Pod 级环边的步骤键为 `afterMount:active:from->to`。当同一条边既是延迟链接又是 Pod 级环边时（即目标合约在挂载前未注册，且该边属于拓扑环），两个阶段可能尝试链接同一条边。为此，在处理 Pod 级环边时，系统同时检查 `afterMount:*` 与 `link:*` 两个键，任一存在则跳过，防止向链上发送重复的 `addActivePodAfterMount` 调用而触发合约侧的 `"Module exists"` 回滚。

此外，在发送挂载后链接交易前，系统还通过 `podLinkExists()` 向链上查询该边是否已存在，作为 `completedSteps` 之外的第二道防线。这一设计使装配流程在面对网络中断、进程崩溃或手动干预等异常情况时，均能安全地从检查点恢复，而不会因重复操作导致链上状态损坏。
