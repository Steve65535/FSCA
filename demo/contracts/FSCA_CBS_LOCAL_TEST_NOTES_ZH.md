# Arkheion CBS 本地测试记录

本文记录了在 `/Users/steve/Desktop/Test` 按 Manual Sei CBS 流程回放时发现的问题、根因和修复结果。

## 最终结果

本地流程已完整跑通：

1. `arkheion deploy --contract AccountStorage`
2. `arkheion deploy --contract TradeEngineV1`
3. `arkheion deploy --contract RiskGuardV1`
4. 挂载 `AccountStorage`
5. 挂载 `RiskGuardV1`
6. 链接 `TradeEngineV1 -> AccountStorage`
7. 链接 `TradeEngineV1 -> RiskGuardV1`
8. 挂载 `TradeEngineV1`
9. `arkheion cluster upgrade --id 2 --contract TradeEngineV2`
10. 最终验证 `cluster list mounted`、`cluster info 2`、`cluster graph`

## 发现的问题与原因

### 1. 业务合约 import 仍指向旧 demo 目录结构

问题：

- `AccountStorage.sol`、`TradeEngineV1.sol`、`TradeEngineV2.sol`、`RiskGuardV1.sol`
- 这些文件仍在引用 `../core/lib/...`
- 真实 Arkheion 工程结构是 `undeployed/lib`、`undeployed/structure`、`undeployed/wallet`

失败原因：

- demo 合约按 `core/` 与 `undeployed/` 分离结构编写。
- `Test` 工程是 `contracts/undeployed` 自包含结构。

修复：

- 业务合约改为引用 `./lib/...`

### 2. 接口 import 不是自包含路径

问题：

- `TradeEngineV1.sol`、`TradeEngineV2.sol` 使用 `../interfaces/...`

失败原因：

- `Test` 中接口目录在 `contracts/undeployed/interfaces`
- `../interfaces/...` 实际会解析到 `contracts/interfaces/...`，该路径不存在

修复：

- 新增 `contracts/undeployed/interfaces/IAccountStorage.sol`
- 新增 `contracts/undeployed/interfaces/IRiskGuard.sol`
- import 改为 `./interfaces/...`

### 3. `getActiveModuleAddress()` 子合约内部不可直接调用

问题：

- `TradeEngineV1`、`TradeEngineV2` 需要调用 `getActiveModuleAddress(...)`

失败原因：

- `contracts/undeployed/lib/normaltemplate.sol` 中：
  - `getActiveModuleAddress`
  - `getPassiveModuleAddress`
 仍是 `external`
- 子合约继承后不能按内部辅助函数方式直接调用

修复：

- 两个函数由 `external` 改为 `public`

### 4. Hardhat 把 `contracts/deployed` 历史归档也编译进来了

问题：

- 编译失败于 `contracts/deployed/structure/clustermanager.sol`

失败原因：

- `hardhat.config.js` 使用默认 `contracts` 作为源码根目录
- 导致同时编译：
  - `contracts/undeployed`
  - `contracts/deployed`
- `contracts/deployed` 是归档副本，不是当前源码真源
- 其中 import 在作为编译根时不成立

修复：

- 将 Hardhat `sources` 收紧为 `./contracts/undeployed`

## 关键行为发现

### 当前实现不支持“全部先 link 再 mount”

手册目前写的是：

1. deploy
2. link
3. mount

但当前项目里的 `ClusterManager` 实现并不支持这一顺序。

原因：

- `addActivePodBeforeMount` 和 `addPassivePodBeforeMount` 都要求：

```solidity
require(addrToId[targetAddr] == targetId, "target id and addr dismatch");
```

- `addrToId[targetAddr]` 只有在 `registerContract(...)` 后才会写入
- `registerContract(...)` 发生在 `mount`

这意味着：

- 目标合约若还未挂载注册，就不能作为 `beforeMount link` 的 target
- 必须先让 target 进入注册表

## 实际可执行顺序

在 `Test` 里验证通过的顺序是：

1. 先部署全部业务合约
2. 先挂载目标/叶子合约
   - `AccountStorage`
   - `RiskGuardV1`
3. 选择仍未挂载的源合约
   - `TradeEngineV1`
4. 对已挂载 target 执行 `beforeMount` 链接
5. 最后挂载源合约

对应命令：

```bash
arkheion cluster choose "$STORAGE"
arkheion cluster mount 1 AccountStorage

arkheion cluster choose "$RISK"
arkheion cluster mount 3 RiskGuardV1

arkheion cluster choose "$TRADE"
arkheion cluster link positive "$STORAGE" 1
arkheion cluster link positive "$RISK" 3
arkheion cluster mount 2 TradeEngineV1
```

## 验证后的最终状态

- `AccountStorage` 已挂载到 ID `1`
- `RiskGuardV1` 已挂载到 ID `3`
- `TradeEngineV1` 已挂载到 ID `2`
- `TradeEngineV1 -> TradeEngineV2` 热升级成功
- 升级后 ID `2` 指向新地址
- 升级前后都成功生成 `cluster-topology.html`

## Graph 现有限制

当前 `cluster graph` 只能证明拓扑结构，不足以单独证明热替换成功。

原因：

- 节点仅显示：
  - 合约名
  - 合约 ID
- 不显示节点地址
- `Manager` 节点地址也只是缩写

后果：

- 升级前后图结构可能完全一致
- 只能看出结构保持
- 不能仅靠图直接证明：
  - ID `2` 从旧地址切换到了新地址

而热升级最强证明应是：

1. 逻辑 ID 不变
2. 拓扑不变
3. 实现地址变更

当前第 3 点只能靠 `cluster info 2` 或终端日志证明。

## 后续清理建议

1. 更新 `MANUAL_SEI_CBS_GUIDE.md`，改成真实可执行顺序
2. 维持 `undeployed` 完整自包含
3. 将 `contracts/deployed` 仅作为归档，不作为编译源
4. 升级 `cluster graph`，为每个节点展示地址
5. 继续对齐 `core` 与 `undeployed`，避免漂移
