# 使用 FSCA CLI 构建链上微服务集群的最佳实践

> 适用仓库：`fsca-cli`  
> 目标：把“能跑通”提升到“可上线、可升级、可审计、可回滚”。

## 1. 架构设计先行

在部署前先冻结一版“模块拓扑 + ID 规划 + 调用方向”，再进链上操作。

- 模块边界：每个 Pod 保持单一职责（如 `Lending`、`PriceOracle`、`Liquidation`）。
- ID 规划：固定区间，避免后续升级冲突。
- 调用关系：先画图再落命令，避免双向授权遗漏。

推荐 ID 规划（按分层治理，而非随机编号）：

- `1-99`：平台基础设施与保留段（不分配给业务 Pod）
- `100-199`：Storage Pods（长期稳定、尽量不升级）
- `200-399`：Core Logic Pods（业务逻辑，可热升级）
- `400-599`：Adapter / Oracle / 外部接入
- `600-799`：治理与运维辅助模块
- `900+`：实验、灰度、测试

Storage Pod 规划原则：

- Storage ID 一经分配，禁止复用、禁止变更语义。
- Logic Pod 升级始终复用原 Logic ID（通过 `cluster upgrade --id`），不要占用 Storage 段。
- 需要新增数据模型时，优先新增 Storage Pod，不在旧 Storage Pod 上做破坏式语义迁移。
- 共享数据（如全局配置、费率表）建议单独预留稳定区段（例如 `180-189`）。

示例（Lending 域）：

- `110` `AccountStorage`
- `111` `PositionStorage`
- `112` `RiskParamStorage`
- `210` `LendingEngine`
- `211` `LiquidationEngine`
- `212` `InterestEngine`
- `410` `PriceOracleAdapter`

## 2. 环境与配置管理

`project.json` 是核心状态文件，建议按环境隔离：

- `project.dev.json`
- `project.test.json`
- `project.prod.json`

每次切环境前先备份当前配置，并确认以下字段：

- `network.rpc`
- `network.chainId`
- `account.address`
- `account.privateKey`
- `fsca.clusterAddress`（`cluster init` 后写入）

注意：生产环境建议优先使用 `.env`（`FSCA_PRIVATE_KEY`、`FSCA_RPC_URL`）管理密钥与节点配置，不要在仓库中提交敏感字段。

## 3. 推荐上线流程（黄金路径）

## 步骤 A：初始化与骨架部署

```bash
fsca init
fsca cluster init --threshold 2 --yes --cleanup keep
```

实践建议：

- 生产建议 `threshold >= 2`，不要使用 `1/1` 多签。
- `cluster init` 成功后，先执行一次只读核验：

```bash
fsca wallet owners
fsca cluster operator list
```

## 步骤 B：部署业务 Pod（先部署，后挂载）

```bash
fsca deploy --contract LendingPod --description LendingPod --yes --cleanup soft
fsca deploy --contract PriceOracle --description PriceOracle --yes --cleanup soft
fsca deploy --contract LiquidationPod --description LiquidationPod --yes --cleanup soft
```

实践建议：

- 每部署一个 Pod 立即记录地址与交易哈希。
- 以 `fsca cluster choose <address>` 显式切上下文，避免误操作到上一个合约。

## 步骤 C：先配 Link，再 Mount

以 `LendingPod -> PriceOracle`、`LendingPod -> LiquidationPod` 为例：

```bash
fsca cluster choose <LendingPod-Address>
fsca cluster link active <PriceOracle-Address> 2
fsca cluster link active <LiquidationPod-Address> 3
```

关键注意：

- 推荐写法为 `active` / `passive`（CLI 对 `active` 做兼容映射）。
- 历史命令中的 `positive` 仍可用，但不建议再作为主示例。

## 步骤 D：挂载上线

```bash
fsca cluster choose <LendingPod-Address>
fsca cluster mount 1 "LendingPod"

fsca cluster choose <PriceOracle-Address>
fsca cluster mount 2 "PriceOracle"

fsca cluster choose <LiquidationPod-Address>
fsca cluster mount 3 "LiquidationPod"
```

上线后核验：

```bash
fsca cluster list mounted
fsca cluster info 1
fsca cluster graph
```

## 4. 治理与权限最佳实践

- `rootAdmin` 由多签控制，不直接用 EOA 做系统级变更。
- Operator 最小化，只给执行集群操作的账户。
- 高频操作走流程化：`submit -> confirm -> execute`，并保留审计记录。

典型治理命令：

```bash
fsca wallet submit --to <target> --value 0 --data <hexData>
fsca wallet confirm <txIndex>
fsca wallet execute <txIndex>
fsca wallet info <txIndex>
```

## 5. 升级策略（零停机优先）

推荐使用：

```bash
fsca cluster check
fsca cluster upgrade --id <id> --contract <NewContractName> --yes --cleanup soft
```

默认行为会复制旧合约的 active/passive 模块关系并重新挂载。适用于接口兼容升级。

当新版本依赖关系有重大变化时：

```bash
fsca cluster upgrade --id <id> --contract <NewContractName> --skip-copy-pods
```

然后手动重建 link 并做回归验证。

升级前检查清单：

- 新合约构造函数与当前部署逻辑兼容（通常需 `clusterAddress`）。
- ABI 变更是否影响调用方。
- 回滚路径是否可执行（旧版本 artifact 与地址记录齐全）。

## 6. 回滚与应急（M2）

建议将回滚纳入标准命令，而不是“临时再部署回切”：

```bash
# 查看版本链
fsca cluster history --id <id>

# 预演回滚（不写链）
fsca cluster rollback --id <id> --dry-run

# 回滚到上一个版本
fsca cluster rollback --id <id> --yes

# 回滚到指定版本
fsca cluster rollback --id <id> --generation <n> --yes
```

应急 SOP：

1. 用 `cluster history` 确认目标版本（`deprecated`）。
2. 先 `rollback --dry-run` 核对计划。
3. 执行 `rollback`，检查 `rollback-report.json`。
4. 回归 `cluster graph`、核心业务用例、权限用例。

## 7. 可观测性与验收

每次结构变更后至少执行：

- `fsca cluster graph`：拓扑是否符合设计图。
- `fsca cluster list mounted`：挂载集是否正确。
- `fsca normal get modules active|passive`：关键链路是否存在。

建议在 CI/CD 中加入：

- `npx hardhat compile`
- `npx hardhat test`
- 关键命令 smoke 测试（部署、链接、挂载、升级、回滚）
- 变更日志留存：`logs/<date>.log`、`cleanup-report.json`、`rollback-report.json`

## 8. 代码实现层面的坑位提示

基于当前仓库实现，建议特别注意：

- `fsca cluster link` 建议使用 `active/passive`（旧别名 `positive` 仍兼容）。
- `fsca deploy` 依赖 `fsca.clusterAddress`，通常要先 `fsca cluster init`。
- `fsca cluster choose` 会扫描注册表进行状态检查，注册量大时耗时会上升。
- `project.json` 是状态真源之一，建议纳入版本管理策略并做变更审计。

## 9. 生产落地模板（可直接套用）

```bash
# 0) 环境准备
cp project.prod.json project.json

# 1) 静态检查
fsca cluster check

# 2) 骨架部署
fsca cluster init --threshold 2 --yes --cleanup keep
fsca wallet owners
fsca cluster operator list

# 3) 业务部署
fsca deploy --contract LendingPod --yes --cleanup soft
fsca deploy --contract PriceOracle --yes --cleanup soft
fsca deploy --contract LiquidationPod --yes --cleanup soft

# 4) 链路配置（未挂载阶段）
fsca cluster choose <LendingPod-Address>
fsca cluster link active <PriceOracle-Address> 2
fsca cluster link active <LiquidationPod-Address> 3

# 5) 挂载上线
fsca cluster choose <LendingPod-Address> && fsca cluster mount 1 "LendingPod"
fsca cluster choose <PriceOracle-Address> && fsca cluster mount 2 "PriceOracle"
fsca cluster choose <LiquidationPod-Address> && fsca cluster mount 3 "LiquidationPod"

# 6) 验收
fsca cluster list mounted
fsca cluster graph

# 7) 后续升级（推荐先 check）
fsca cluster check
fsca cluster upgrade --id 1 --contract LendingPodV2 --yes --cleanup soft

# 8) 应急回滚
fsca cluster rollback --id 1 --dry-run
fsca cluster rollback --id 1 --yes
```

## 10. 参考资料

- `README.md`
- `README.zh-CN.md`
- `user-guide.md`
- `libs/commands/cluster/link.js`
- `libs/commands/cluster/upgrade.js`
- `libs/commands/cluster/mount.js`
- `libs/commands/deploy.js`

## 11. 推荐架构：存储与逻辑分离（Storage Pod + Service Pods）

这是构建“可长期演进的链上微服务集群”的推荐形态：

- 存储 Pod：只负责持久化数据，接口极简（`get/set`）。
- 逻辑 Pod：承载业务规则，可独立热升级。
- 编排层：通过 ClusterManager/EvokerManager 管理依赖和调用授权。

核心目标：

- 数据地址稳定，不随业务迭代迁移。
- 业务快速迭代，通过 `cluster upgrade` 替换逻辑模块。
- 降低升级风险，避免“迁移数据 + 改逻辑”耦合导致事故。

### 11.1 数据层建议：双重 mapping

对于账户资产、额度、参数等场景，建议采用双重 mapping 结构：

```solidity
mapping(uint32 => mapping(address => uint256)) private _balances;
// key1: tokenId / assetId
// key2: user address
```

或：

```solidity
mapping(bytes32 => mapping(address => uint256)) private _kv;
// key1: 业务域键（如 keccak256("margin"|"credit"|"risk"...))
// key2: user / actor
```

这样做的好处：

- 按“资产维度 x 用户维度”天然分片，读写模型稳定。
- 新业务通常只新增 key，不需要迁移旧数据结构。
- 对逻辑升级友好，接口保持兼容即可复用历史状态。

### 11.2 数据 Pod 接口最小化

数据合约只保留基础接口，避免承载业务判断：

- `getBalance(tokenId, user)`
- `setBalance(tokenId, user, amount)`
- `getValue(namespace, user)`
- `setValue(namespace, user, amount)`

禁止在数据 Pod 内做：

- 复杂业务规则（利率、清算、风控判定）
- 跨模块调用编排
- 高频迭代逻辑

这样可以保证“数据层尽量不升级”，把升级压力放到服务层。

### 11.3 服务集群升级模式

推荐模式：

1. 数据 Pod 长周期稳定运行（通常不升级）。
2. 逻辑 Pod（如 TradeEngine、RiskGuard、Lending）按版本热替换。
3. 通过 `fsca cluster upgrade --id <id> --contract <V2>` 升级逻辑模块。
4. 若依赖关系变化，使用 `--skip-copy-pods` 后手动重建链路。

这就是“链上微服务集群”的关键形态：  
`Stable Data Layer + Evolvable Service Layer`。

### 11.4 治理与权限建议

- 数据写接口默认仅允许白名单逻辑 Pod 调用（active/passive link + ABI 权限）。
- 治理变更（新增逻辑模块、升级逻辑模块、权限调整）统一走多签流程。
- 数据 Pod 的管理员权限与逻辑 Pod 的升级权限分离，降低单点风险。

### 11.5 推荐模块分层

- L0 数据层：`AccountStorage`, `PositionStorage`, `ConfigStorage`
- L1 业务层：`TradeEngine`, `LendingEngine`, `LiquidationEngine`
- L2 治理层：`ProxyWallet` + proposal 工作流
- L3 编排层：`ClusterManager` + `EvokerManager`

上线顺序建议：

1. 先部署并挂载 Storage Pods
2. 再部署 Service Pods 并建立 link
3. 最后启用外部入口与权限

### 11.6 为什么这是推荐形式

- 数据不迁移：减少最危险的升级动作。
- 逻辑可替换：满足高频业务迭代。
- 权限可审计：每次结构变更可追踪、可审批、可回滚。
- 与 FSCA 模型天然匹配：Pod 化、链接化、治理化。

## 12. 权限说明与 normalTemplate 库函数使用

本节基于 `libs/fsca-core/lib/normaltemplate.sol` 的实际实现。

### 12.1 权限模型（谁可以调用什么）

- `onlyCluster`：仅 `ClusterManager` 或 `EvokerManager` 可调用。
- `notMounted`：仅在 `whetherMounted == 0`（未挂载）时允许调用。
- `checkAbiRight(abiId)`：调用者在 `ProxyWallet._userRights` 中的权限值需满足阈值。
- `activeModuleVerification(contractId)`：校验 `msg.sender` 是否匹配 activePod 中该 ID 的模块地址。
- `passiveModuleVerification(contractId)`：校验 `msg.sender` 是否匹配 passivePod 中该 ID 的模块地址。

关键含义：

- 模块关系配置（add/remove active/passive）本质是“集群控制面动作”，业务合约自己不能随意改。
- ABI 权限控制是“运行时调用闸门”，适合保护敏感函数（如管理员操作、清算入口）。

### 12.2 normalTemplate 关键函数清单

注册/状态类：

- `setWhetherMounted(uint8)`  
- `setContractId(uint32)`  
- `setProxyWalletAddr(address)`

ABI 权限类：

- `setAbiRight(uint256 abiId, uint256 maxRight)`
- `removeAbiRight(uint256 abiId)`
- `checkAbiRight(uint256 abiId)`（modifier）

模块关系类：

- `addActiveModule(uint32, address)`
- `removeActiveModule(uint32)`
- `addPassiveModule(uint32, address)`
- `removePassiveModule(uint32)`

查询类：

- `getAllActiveModules()`
- `getAllPassiveModules()`
- `getAllActiveAddresses()`
- `getAllPassiveAddresses()`
- `getActiveModuleAddress(uint32)`
- `getPassiveModuleAddress(uint32)`

### 12.3 业务合约中推荐用法

```solidity
pragma solidity ^0.8.21;
import "../undeployed/lib/normaltemplate.sol";

contract TradeEngine is normalTemplate {
    constructor(address clusterAddr) normalTemplate(clusterAddr, "TradeEngine") {}

    // 仅满足 ABI 权限阈值的地址可调用
    function setFee(uint256 newFee)
        external
        checkAbiRight(uint256(keccak256("setFee(uint256)")))
    {
        // ...
    }

    // 仅允许指定 active 模块（例如 RiskGuard ID=3）调用
    function liquidate(address user)
        external
        activeModuleVerification(3)
    {
        // ...
    }
}
```

### 12.4 CLI 对应操作（推荐流程）

1. 先选择当前操作合约：

```bash
fsca cluster choose <Pod-Address>
```

2. 设置 ABI 权限（通过 ClusterManager 转发执行）：

```bash
fsca normal right set <abiId> <maxRight>
fsca normal right remove <abiId>
```

3. 查询模块关系：

```bash
fsca normal get modules active
fsca normal get modules passive
```

### 12.5 重要注意事项

- `fsca normal right` 是经 `ClusterManager.universalCall` 间接调用 `setAbiRight/removeAbiRight`，不是直接 EOA 调合约。
- 模块增删受 `notMounted` 约束，通常应在未挂载阶段配置好依赖。
- `checkAbiRight` 依赖 `proxywalletaddr` 与 `_userRights` 正确初始化；生产前务必做端到端权限回归测试。

### 12.6 Passive Pod 调用来源校验（你说的这个 modifier）

`normalTemplate` 里已经提供了：

- `passiveModuleVerification(uint32 contractId)`

作用：

- 仅允许 `msg.sender` 来自 passivePod 中指定 `contractId` 对应的模块地址。

推荐用法：

```solidity
function onSettlementCallback(bytes32 orderId)
    external
    passiveModuleVerification(2) // 仅允许 passive pod 中 ID=2 的模块回调
{
    // callback logic
}
```

与 `activeModuleVerification` 的区别：

- `activeModuleVerification(id)`：校验调用者来自 activePod
- `passiveModuleVerification(id)`：校验调用者来自 passivePod

实务建议：

- 对“回调类函数、确认类函数、状态同步函数”优先使用 `passiveModuleVerification`。
- 对“被指定上游模块触发的核心入口”使用 `activeModuleVerification`。

## 13. 自动装配最佳实践（cluster auto / cluster check）

### 13.1 注解规范（推荐模板）

```solidity
// @fsca-auto yes
// @fsca-id 2
// @fsca-active 1,3
// @fsca-passive 4
contract TradeEngineV2 is normalTemplate {
    // business logic
}
```

规范要求：
- `@fsca-id` 全局唯一，禁止复用。
- `@fsca-active` / `@fsca-passive` 只填写目标 Pod ID，逗号分隔。
- 未接入自动装配的合约不要写 `@fsca-auto yes`。
- 一文件一业务合约，便于扫描与定位冲突。

### 13.2 自动装配命令敲定顺序

```bash
fsca cluster check
fsca cluster auto --dry-run
fsca cluster auto
fsca cluster graph
```

顺序说明：
- `check`：先发现 ID 冲突、注解缺失、环依赖问题。
- `dry-run`：只看计划，不做链上写操作。
- `auto`：正式执行 deploy/link/mount。
- `graph`：最终验证拓扑是否符合设计。

### 13.3 生产建议

- PR 阶段必须附 `cluster check` 和 `cluster auto --dry-run` 输出。
- 生产变更窗口执行 `cluster auto` 前，先冻结 `project.json` 快照。
- 出现函数级环告警时，先修业务调用路径，再执行正式装配。
- 自动装配后至少回归：`cluster list mounted`、`cluster info <id>`、`cluster graph`。

## 14. 版本治理（M2）落地建议

当前版本治理建议按以下原则执行：

- `alldeployedcontracts` 作为历史账本，至少保留 `generation`、`status`、`deploySeq`、`podSnapshot`。
- 只允许通过 `cluster rollback` 恢复 `deprecated` 版本，避免手工 mount 旧版本造成语义漂移。
- 每次升级/回滚后都执行：
  - `fsca cluster history --id <id>`
  - `fsca cluster list mounted`
  - `fsca cluster graph`
- 归档策略建议：
  - 生产：`--cleanup soft`
  - 测试：`--cleanup keep` 或 `soft`
  - 禁止默认使用 `--cleanup hard` 作为常规流程
