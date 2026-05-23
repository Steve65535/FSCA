# 第二章 系统架构设计

## 2.1 设计目标

Arkheion 的架构设计以解决第一章所述的四类工程问题为出发点，并在此基础上确立了以下五项核心设计目标。

**目标一：依赖关系的一等链上表达。** 合约之间的调用关系应当以可查询、可治理的方式存储于链上，而非分散于源码注释、部署脚本或外部文档中。这要求系统提供一种统一的依赖抽象，使拓扑信息在链上与工具链之间保持语义一致，并支持在不修改业务逻辑的前提下完成依赖关系的声明与变更。

**目标二：声明式的自动化装配能力。** 开发者应能够以最小的额外标注完成多合约系统的部署与链接，工具链负责推导拓扑顺序、处理循环依赖并协调链上操作序列。自动化装配过程必须具备幂等性，以支持中断恢复与重复执行。

**目标三：拓扑级的版本治理与回滚。** 系统应在每次链上操作后维护完整的版本记录与拓扑快照，使任意历史版本的恢复操作能够在地址无关的前提下完成。版本治理模型应区分全局部署序号与合约级版本代次，以支持精确的历史定位。

**目标四：与链上治理机制的深度集成。** 所有涉及集群拓扑变更的操作均应通过统一的权限入口执行，并与多签治理流程相兼容。系统不应绕过链上治理约束，而应将自动化能力构建于治理边界之上。

**目标五：可审计的操作语义。** 每次部署、链接、挂载、升级与回滚操作均应在链上留下结构化的可验证记录，并在工具链侧维护与链上状态同步的本地日志，以支持审计、合规与安全响应工作。

上述五项目标共同构成了 Arkheion 架构设计的约束边界。在此边界内，系统在模块化程度、Gas 成本与静态分析精度之间进行了若干有意识的权衡，将在 2.6 节中详细讨论。

## 2.2 系统总体架构

Arkheion 采用分层架构，由链上合约层、CLI 工具链层与静态分析层三个主要层次构成，各层之间通过明确定义的接口进行交互。

**链上合约层**是系统的执行基础，负责维护集群注册表、依赖图与权限状态。该层由六个合约组成：ClusterManager 作为中央注册表与操作入口，EvokerManager 维护合约间的有向依赖图，NormalTemplate 为所有业务合约提供 Pod 存储与访问控制基类，AddressPod 库提供 O(1) 复杂度的 Pod 操作原语，MultiSigWallet 提供多签治理能力，ProxyWallet 提供层级权限管理。

**CLI 工具链层**是系统的操作界面，负责将开发者的声明式意图转化为有序的链上操作序列。该层基于 Node.js 与 ethers.js v6 构建，包含树状命令解析器、命令执行器、链交互抽象层（provider、signer、deploy、tx）以及 43 个命令处理器。工具链通过 project.json 维护本地状态缓存，并在每次链上操作后与链上状态同步。

**静态分析层**是系统的预执行保障，负责在链上操作发生之前对合约集群的拓扑结构进行静态检查。该层包含注解扫描器、注解解析器、Pod 级依赖图分析器、函数级调用图分析器与状态协调器，共同构成自动装配流水线的前置阶段。

三层之间的数据流向如下：静态分析层消费合约源码与 project.json，生成装配计划；CLI 工具链层按照装配计划向链上合约层发送交易；链上合约层执行操作并更新链上状态；CLI 工具链层在操作确认后读取链上状态并同步至 project.json。这一闭环确保了本地记录与链上状态的持续一致性。

## 2.3 Pod 运行时依赖模型

Pod 模型是 Arkheion 架构的核心抽象，其设计目标是将合约间的调用关系从实现代码中解耦，以可治理的方式存储于链上，并在运行时提供可验证的访问控制语义。

### 2.3.1 基本结构

每个业务合约通过继承 `normalTemplate` 获得两个 Pod 存储槽：

- **activePod**：记录本合约主动调用的合约集合，即出向依赖。业务合约在调用其他模块时，应通过 `activeModuleVerification` 修饰符验证调用目标是否在 activePod 中注册，从而防止对未授权地址的调用。
- **passivePod**：记录调用本合约的合约集合，即入向依赖。业务合约在暴露敏感接口时，应通过 `passiveModuleVerification` 修饰符验证调用方是否在 passivePod 中注册，从而实现调用方白名单控制。

两个 Pod 均以 `contractId`（`uint32`）为主键，以合约地址为值，通过 `AddressPod` 库进行管理。`contractId` 是集群内的逻辑标识，在合约地址发生变化（如升级）后保持不变，这是实现地址无关版本治理的基础。

### 2.3.2 AddressPod 库的数据结构

`AddressPod.Pod` 采用双映射结构以实现 O(1) 的增删查验操作：

```
Pod {
    Module[] modules          // 顺序数组，支持遍历
    mapping(contractId → index+1)   // 正向索引，O(1) 按 ID 查找
    mapping(address → contractId)   // 反向索引，O(1) 按地址查找
}
```

删除操作采用 swap-pop 策略：将待删除元素与数组末尾元素交换后弹出，避免数组空洞，保持 O(1) 摊销复杂度。正向索引存储 `index+1`（而非 `index`），以区分"不存在"（值为 0）与"位于索引 0"（值为 1）两种状态，消除了零值歧义。

### 2.3.3 挂载锁定机制

`normalTemplate` 维护一个 `whetherMounted` 标志位（`uint8`，0 = 未挂载，1 = 已挂载）。所有 Pod 修改操作（`addActiveModule`、`removeActiveModule` 等）均通过 `notMounted` 修饰符检查该标志，确保已挂载合约的 Pod 不可被直接修改。

这一设计保证了已挂载合约拓扑的不可篡改性：任何拓扑变更必须经过 ClusterManager 的统一入口，由 EvokerManager 在解锁-操作-重锁的原子序列中完成，从而防止绕过治理流程的直接 Pod 修改。

### 2.3.4 依赖关系的方向性语义

activePod 与 passivePod 共同构成一条有向依赖边的两端：若合约 A 的 activePod 中包含合约 B，则合约 B 的 passivePod 中必然包含合约 A，反之亦然。EvokerManager 在 `mount` 操作中负责维护这一双向一致性，在 `unmount` 操作中负责对称地清除两端记录。

这种双向冗余存储虽然增加了链上存储开销，但带来了两项重要收益：其一，任意合约可以在 O(1) 时间内查询自身的全部入向与出向依赖，无需遍历全局注册表；其二，`unmount` 操作可以直接从被卸载合约的 Pod 中读取邻居列表，无需在全局图中搜索，降低了卸载操作的 Gas 成本。

## 2.4 集群生命周期模型

Arkheion 为集群中的每个合约定义了一套完整的生命周期状态机，涵盖从部署到归档的全过程。

### 2.4.1 状态定义

合约在集群中的状态由 project.json 中的 `status` 字段记录，取值为以下四种之一：

- **deployed**：合约已部署至链上，但尚未在 ClusterManager 中注册，Pod 可自由修改。
- **mounted**：合约已通过 `registerContract` 在 ClusterManager 中注册，Pod 已锁定，依赖边已在 EvokerManager 中建立。
- **deprecated**：合约已通过 `deleteContract` 从 ClusterManager 中注销，Pod 已解锁，但合约字节码仍存在于链上，可作为回滚目标。
- **archived**：合约已被标记为不可回滚，不再参与版本治理流程。

状态转换路径为：`deployed → mounted → deprecated → archived`。`deprecated` 与 `archived` 状态的合约被 `cluster mount` 命令拒绝，防止意外重新挂载旧版本。

### 2.4.2 挂载流程

挂载操作是将一个已部署合约纳入集群管理的核心流程，分为挂载前配置与挂载两个阶段。

**挂载前配置（BeforeMount）**：在合约尚未挂载（`whetherMounted=0`）时，通过 `ClusterManager.addActivePodBeforeMount()` 与 `addPassivePodBeforeMount()` 向合约的 Pod 中注入依赖关系。此阶段要求目标合约已在 ClusterManager 中注册（`addrToId[targetAddr] == targetId` 校验），以防止注入错误地址。

**挂载（Mount）**：调用 `ClusterManager.registerContract(id, name, addr)`，该函数执行以下操作序列：

1. 校验 id、name、addr 的唯一性
2. 将合约写入注册表（`contractRegistrations`、`idToIndex`、`nameToId`、`addrToId`）
3. 调用 `normalTemplate.setContractId(id)` 绑定逻辑标识
4. 调用 `normalTemplate.setProxyWalletAddr(rightManager)` 配置权限管理器
5. 调用 `EvokerManager.mount(addr)` 建立依赖边并锁定合约

`EvokerManager.mount()` 读取合约的 activePod 与 passivePod，为每条依赖关系在邻接表中建立有向边，并在邻居合约的 Pod 中写入反向记录，最后将合约的 `whetherMounted` 置为 1。

### 2.4.3 卸载流程

卸载操作通过 `ClusterManager.deleteContract(id)` 触发，执行以下操作序列：

1. 从注册表中删除合约记录（swap-pop 维护数组紧凑性）
2. 清除 `idToIndex`、`nameToId`、`addrToId` 三个映射
3. 调用 `EvokerManager.unmount(addr)`

`EvokerManager.unmount()` 首先将目标合约解锁（`whetherMounted=0`），然后遍历其 activePod 与 passivePod，对每个邻居执行解锁-清除反向记录-重锁的操作序列，最后从节点集合中移除目标合约。邻居的解锁-重锁操作确保了在卸载过程中不会因邻居处于锁定状态而产生冲突。

### 2.4.4 挂载后链接

对于在挂载后需要新增的依赖边（如循环依赖的延迟处理），系统提供 `addActivePodAfterMount()` 与 `addPassivePodAfterMount()` 接口，这两个接口内部调用 `EvokerManager.mountSingle()`，在解锁-操作-重锁的原子序列中完成单条边的添加，无需重新执行完整的挂载流程。

### 2.4.5 热替换升级流程

热替换升级（`cluster upgrade`）是 Arkheion 版本治理的核心操作，其执行序列如下：

1. 读取旧合约的 Pod 快照（activePod、passivePod）
2. 部署新合约至链上
3. 通过 BeforeMount 接口将旧合约的 Pod 配置复制至新合约
4. 卸载旧合约（`deleteContract`）：移除所有依赖边，解锁邻居
5. 挂载新合约（`registerContract`）：重建所有依赖边，锁定新合约
6. 从链上读取新合约的实际 Pod 状态，写入 podSnapshot
7. 更新 project.json 中的版本记录（generation、status、upgradedFrom）

步骤 4 与步骤 5 之间存在短暂的拓扑空窗期，在此期间旧合约已卸载而新合约尚未挂载。这是链上不可变性约束下的固有限制，Arkheion 通过在步骤 3 中预先完成 Pod 配置来最小化空窗期的持续时间。

## 2.5 治理与权限模型

Arkheion 的权限模型采用两级分层结构，将集群操作权限与业务调用权限分别管理。

### 2.5.1 集群操作权限层

集群操作权限由 ClusterManager 管理，分为两个级别：

- **rootAdmin**：不可变的最高权限持有者，在 ClusterManager 部署时通过构造函数设定。rootAdmin 可以添加与移除 operator，但自身不可被替换，以防止权限根节点被攻击者接管。
- **operator**：由 rootAdmin 授权的操作者，可执行合约注册、卸载、Pod 配置与通用调用等集群操作。operator 集合通过 `operatorPod`（内部采用与 AddressPod 相同的 swap-pop 结构）管理，支持 O(1) 的成员校验。

在实际部署中，rootAdmin 通常设置为 MultiSigWallet 的地址，使所有 rootAdmin 级别的操作（如添加 operator）均需经过多签确认，从而将单点密钥风险分散至多个签名方。

### 2.5.2 多签治理层

MultiSigWallet 实现标准的多签流程：`submitTransaction → confirmTransaction → executeTransaction`，并支持 `revokeConfirmation` 撤销已提交的确认。治理提案包括 `proposeAddOwner`、`proposeRemoveOwner` 与 `proposeChangeThreshold`，分别用于管理签名者集合与确认阈值。

在 `cluster init` 流程中，MultiSigWallet 被部署为 ClusterManager 的 rootAdmin，后续所有需要 rootAdmin 权限的操作均通过多签流程执行，确保集群治理的去中心化与可审计性。

### 2.5.3 业务调用权限层

业务合约的接口调用权限由 ProxyWallet（rightManager）管理。ProxyWallet 维护一个 `_userRights` 映射（`address → uint256`），记录每个地址的权限级别。`normalTemplate` 中的 `checkAbiRight` 修饰符在业务接口调用时验证调用方的权限级别是否满足接口要求，实现细粒度的接口访问控制。

权限级别采用层级设计：任何主体均无法向他人授予高于或等于自身级别的权限，从而防止权限提升攻击。

### 2.5.4 onlyCluster 访问控制

`normalTemplate` 中的 `onlyCluster` 修饰符将所有 Pod 修改操作限制为仅允许 ClusterManager 或 EvokerManager 调用：

```solidity
modifier onlyCluster {
    address evoker = IClusterManager(clusterAddress).evokerManager();
    require(
        msg.sender == clusterAddress ||
        (evoker != address(0) && msg.sender == evoker),
        "Not cluster or evoker"
    );
    _;
}
```

这一设计确保了 Pod 状态只能通过 Arkheion 的治理入口修改，外部账户或其他合约无法直接操纵业务合约的依赖关系。

## 2.6 设计权衡

Arkheion 的架构设计在若干维度上存在有意识的权衡，本节对主要权衡点进行说明。

### 2.6.1 链上存储成本与可查询性

将依赖关系以双向冗余的方式存储于链上，使每条依赖边在 activePod 与 passivePod 中各占一份存储，并在 EvokerManager 的邻接表中额外维护一份图结构。这一设计的存储成本随依赖边数量线性增长，在依赖关系密集的大型集群中可能产生显著的 Gas 开销。

权衡的另一侧是可查询性与操作效率：任意合约可在 O(1) 时间内完成依赖查询与访问控制验证，卸载操作无需全局图遍历。对于依赖关系相对稳定、查询频率远高于修改频率的生产环境，这一权衡是合理的。未来可通过批量挂载/链接交易降低单次操作的 Gas 成本。

### 2.6.2 挂载锁定的严格性与灵活性

`whetherMounted` 锁定机制在保证已挂载合约拓扑不可篡改的同时，也要求所有 Pod 修改操作必须经过解锁-操作-重锁的完整序列。这一设计在防止未授权修改的同时，增加了每次 Pod 操作的交易数量。

对于需要频繁调整依赖关系的开发阶段，可以选择在挂载前完成所有 Pod 配置，避免反复的解锁-重锁开销。对于生产环境，锁定机制提供的安全保证通常优先于操作便利性。

### 2.6.3 静态分析的精度与实用性

Arkheion 的函数级调用分析基于命名约定（`IFoo(addr).method()` 模式）而非 AST 级别的过程间分析，属于轻量级的启发式方法，不具备 soundness 保证。这意味着系统可能漏报部分函数级循环（假阴性），但不会误报（假阳性）。

这一选择的依据是实用性优先：AST 级别的 Solidity 过程间分析需要引入完整的编译器前端，显著增加工具链的复杂度与依赖负担。对于大多数实际协议，基于命名约定的分析已能覆盖主要的跨合约调用模式。对于需要更高分析精度的场景，开发者可以通过 `cluster auto check` 的诊断输出手动审查潜在的函数级循环。

### 2.6.4 热替换的原子性与空窗期

热替换升级在卸载旧合约与挂载新合约之间存在短暂的拓扑空窗期，在此期间依赖旧合约的其他模块可能因找不到有效的 Pod 记录而产生调用失败。这是链上不可变性约束下的固有限制，无法通过纯链上机制完全消除。

Arkheion 通过在升级前预先完成新合约的 Pod 配置（BeforeMount 阶段）来最小化空窗期的持续时间，并建议在低流量时段执行升级操作。对于对可用性要求极高的场景，可以考虑在应用层引入降级逻辑，在升级窗口期间暂时屏蔽对相关模块的调用。
