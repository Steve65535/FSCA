# FSCA Cluster Visualizer — 进阶可视化方案

## 目标

构建一个实时交互式 Web Dashboard，可视化展示合约集群的依赖拓扑图，并支持链上事件驱动的实时动画（mount/unmount/upgrade 过程可视化）。面向 ETHGlobal Hackathon demo 场景优化。

---

## 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 前端框架 | React (Vite) | 快速搭建，生态成熟 |
| 图可视化 | D3.js force-graph | 力导向图天然适合依赖拓扑，动画能力强 |
| 链交互 | ethers.js v6 | 与现有 CLI 保持一致，复用 ABI |
| 样式 | Tailwind CSS | 快速出效果，暗色主题适合 demo |
| 构建 | Vite | 零配置，开发体验好 |

不引入后端服务，前端直接通过 ethers.js 连接 RPC 节点读取链上状态 + 监听事件。

---

## 目录结构

```
dashboard/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── src/
│   ├── main.jsx              # 入口
│   ├── App.jsx               # 主布局
│   ├── config.js             # 读取 project.json 配置
│   ├── chain/
│   │   ├── provider.js       # ethers provider 初始化
│   │   ├── contracts.js      # ClusterManager / EvokerManager / normalTemplate 合约实例
│   │   └── events.js         # 事件监听器（NodeMounted, NodeUnmounted, ModuleChanged）
│   ├── graph/
│   │   ├── ForceGraph.jsx    # D3 force-graph React 组件
│   │   ├── graphData.js      # 链上数据 → { nodes, edges } 转换
│   │   └── animations.js     # mount/unmount/upgrade 动画逻辑
│   ├── components/
│   │   ├── Sidebar.jsx       # 侧边栏：集群信息 + 合约列表
│   │   ├── NodeDetail.jsx    # 点击节点弹出的详情面板
│   │   ├── EventLog.jsx      # 实时事件流（底部滚动日志）
│   │   └── StatusBar.jsx     # 顶部状态栏：网络/区块/连接状态
│   └── styles/
│       └── graph.css         # 图相关自定义样式（发光、脉冲动画）
```

---

## 实现分步

### Phase 1: 基础拓扑图（静态快照）

**目标**: 从链上读取集群状态，渲染交互式力导向图。

1. **项目初始化**
   - Vite + React + Tailwind + D3 脚手架
   - 配置 `config.js` 读取上层 `project.json` 获取 RPC / 合约地址

2. **链上数据拉取** (`chain/contracts.js`, `graph/graphData.js`)
   - 连接 ClusterManager，遍历 `contractRegistrations[]` 获取所有已挂载合约
   - 对每个合约调用 `getAllActiveModules()` / `getAllPassiveModules()` 获取边
   - 转换为 D3 格式: `{ nodes: [{id, name, address, status}], links: [{source, target, type}] }`

3. **力导向图渲染** (`graph/ForceGraph.jsx`)
   - 节点: 圆形，大小按连接数缩放，颜色区分状态（mounted=绿, unmounted=灰）
   - 边: active 依赖用实线箭头，passive 依赖用虚线箭头
   - 交互: 拖拽节点、缩放平移、hover 显示合约名/地址/ID
   - ClusterManager 作为中心特殊节点（星形或六边形）

4. **侧边栏 + 详情面板** (`components/Sidebar.jsx`, `components/NodeDetail.jsx`)
   - 左侧列表展示所有合约（ID / 名称 / 地址缩写）
   - 点击节点或列表项 → 右侧面板显示: activePod 列表、passivePod 列表、whetherMounted 状态、contractId

### Phase 2: 实时事件驱动

**目标**: 监听链上事件，图自动更新 + 动画反馈。

5. **事件监听** (`chain/events.js`)
   - 监听 EvokerManager 事件:
     - `NodeMounted(from, to)` → 新增边 + 动画
     - `NodeUnmounted(from, to)` → 移除边 + 动画
   - 监听 normalTemplate 事件:
     - `ModuleChanged(podAddr, contractId, moduleAddress, action)` → Pod 变更提示
   - 监听 ClusterManager 事件:
     - `ContractCalled(caller, target, abiName, success)` → 调用流可视化

6. **事件日志** (`components/EventLog.jsx`)
   - 底部固定区域，实时滚动显示事件流
   - 每条事件: 时间戳 + 事件类型 + 涉及合约 + 交易哈希（可点击跳转 explorer）

7. **图动态更新** (`graph/graphData.js`)
   - 收到 NodeMounted → 向 nodes/links 数组追加，D3 simulation restart
   - 收到 NodeUnmounted → 从 links 中移除，检查孤立节点
   - 保持 D3 simulation 的平滑过渡，避免全量重绘

### Phase 3: 升级动画（Hackathon 杀手级 Demo）

**目标**: 热升级过程的全流程可视化动画。

8. **Upgrade 动画序列** (`graph/animations.js`)

   当检测到一个合约的 unmount + 同 ID 的 mount 连续发生时，触发升级动画:

   ```
   Step 1: 旧节点开始闪烁（黄色脉冲）— 表示即将被替换
   Step 2: 所有连接边逐条变红并消失（unmount 过程）
   Step 3: 旧节点淡出缩小消失
   Step 4: 新节点从中心扩散出现（蓝色发光）
   Step 5: 连接边逐条从新节点射出重连（绿色脉冲）
   Step 6: 新节点稳定为正常绿色，动画结束
   ```

   整个序列约 3-4 秒，用 CSS animation + D3 transition 实现。

9. **动画触发逻辑**
   - 维护一个 `pendingUpgrades` Map: `contractId → { phase, oldAddr, newAddr, timestamp }`
   - 收到 `NodeUnmounted` 事件 → 记录 oldAddr，进入 phase=unmounting
   - 收到同 contractId 的 `NodeMounted` 事件 → 识别为 upgrade，触发完整动画序列
   - 超时 30s 未收到对应 mount → 视为普通 unmount

### Phase 4: 打磨与 Demo 优化

10. **视觉打磨**
    - 暗色主题（深色背景 + 霓虹色节点/边），科技感
    - 节点 hover 时发光效果
    - 边上显示数据流方向的动态粒子（CSS animation 沿 path 移动的小圆点）
    - 响应式布局，适配投影仪 16:9

11. **StatusBar** (`components/StatusBar.jsx`)
    - 显示: 网络名称、当前区块号（实时更新）、已挂载合约数、连接状态指示灯

12. **Demo 模式**（可选）
    - 一键触发模拟数据，不依赖真实链，方便离线演示
    - 预设一组 mock 节点和事件序列，自动播放 mount → link → upgrade 全流程

---

## 链上事件汇总（已有，无需改合约）

| 合约 | 事件 | 用途 |
|------|------|------|
| EvokerManager | `NodeMounted(from, to)` | 新增依赖边 |
| EvokerManager | `NodeUnmounted(from, to)` | 移除依赖边 |
| normalTemplate | `ModuleChanged(podAddr, contractId, moduleAddress, action)` | Pod 增删变更 |
| ClusterManager | `ContractCalled(caller, target, abiName, success)` | 合约调用记录 |

---

## 与现有 CLI 的关系

- Dashboard 是独立的 Web 项目，放在 `dashboard/` 目录
- 复用 CLI 的 `project.json` 配置（RPC、合约地址）
- 不修改任何现有 CLI 代码或合约代码
- `fsca cluster graph` 命令可以保留，作为轻量级 Mermaid 输出的替代方案

---

## 工作量估算

| Phase | 内容 | 文件数 |
|-------|------|--------|
| Phase 1 | 静态拓扑图 + 侧边栏 | ~10 |
| Phase 2 | 事件监听 + 实时更新 | ~3 |
| Phase 3 | 升级动画 | ~2 |
| Phase 4 | 视觉打磨 + Demo 模式 | ~3 |

---

## 关键决策点（需要你确认）

1. **是否需要 Demo 模式**？如果 Hackathon 现场网络不稳定，mock 数据模式可以兜底
2. **是否需要 wallet 连接**？当前方案是只读（通过 RPC 读取 + 监听），不需要用户连接钱包。如果需要在 Dashboard 上直接操作（mount/unmount），则需要加 wallet connect
3. **部署方式**？纯静态站点，可以直接 `npm run build` 后丢到任何静态托管
