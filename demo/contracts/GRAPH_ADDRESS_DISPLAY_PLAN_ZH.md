# Graph 地址展示改造计划

## 目标

让 `fsca cluster graph` 不只展示拓扑，还能直接可视化证明热替换。

## 当前问题

节点标签现在只显示：

- 合约名称
- 合约 ID

这足以展示结构关系，但不足以证明同一逻辑 ID 背后的实现地址已经替换。

## 必须改动

每个节点应展示：

- 合约名称
- 合约 ID
- 合约地址

推荐标签格式：

```text
TradeEngineV1
ID: 2
0x0EDf...4F8c
```

地址展示建议缩写，便于阅读：

- 前 6 位
- `...`
- 后 4 位

示例：

- `0x89dA...D14A`
- `0x0EDf...4F8c`

## 为什么必须做

热升级演示需要在图中直接体现：

- 升级前：
  - `TradeEngineV1`
  - `ID: 2`
  - `0x89dA...D14A`
- 升级后：
  - `TradeEngineV1`
  - `ID: 2`
  - `0x0EDf...4F8c`

这样才能在同一视图中清晰说明：

- 逻辑身份稳定（ID 不变）
- 拓扑关系稳定
- 实现地址已经替换

## 实施方案

1. 修改 `libs/commands/cluster/graph.js`
2. 增加地址缩写 helper（仅用于展示）
3. 节点渲染从：

```js
N${n.id}["${n.name}<br/>(ID: ${n.id})"]
```

改为三行标签：

```js
N${n.id}["${n.name}<br/>ID: ${n.id}<br/>${shortAddr(n.address)}"]
```

4. 内部数据仍使用完整地址，不改变逻辑判断
5. `Manager` 节点地址缩写规则与业务节点保持一致

## 可选增强

若后续要强化展示效果，可增加：

1. 图下方增加 “ID -> 全地址” 对照表
2. 增加升级前后对比模式
3. 同一 ID 地址变化时增加高亮样式

## 最低可接受演示链路

当前 hackathon/demo 版本，建议最少展示：

1. 升级前 `cluster info 2`
2. 升级前 `cluster graph`
3. `cluster upgrade --id 2 --contract TradeEngineV2`
4. 升级后 `cluster info 2`
5. 升级后 `cluster graph`（节点含地址）

这套证据链可以完整证明：

- ID 不变
- 拓扑不变
- 实现地址变化
