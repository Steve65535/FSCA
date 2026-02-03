# FSCA CLI

**Full Stack Contract Architecture** - 下一代智能合约集群管理工具

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/Steve65535/fsca-cli)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)

---

## 🎯 什么是 FSCA?

FSCA 是一个革命性的智能合约开发框架,它将 **Kubernetes 的编排理念** 引入到智能合约开发中。通过 FSCA,你可以像管理微服务一样管理智能合约集群,实现真正的模块化、可组合的 DApp 架构。

### 核心理念

```
传统开发:  单体合约 → 难以维护 → 升级困难
FSCA:      合约集群 → 模块化 → 动态编排 → 灵活升级
```

---

## ✨ 核心优势

### 1. 🏗️ **模块化架构**
```solidity
// 不再需要单体合约
contract MonolithicDeFi {
  // 5000+ 行代码,难以维护
}

// FSCA 方式: 模块化
LendingModule  ──┐
PriceOracle    ──┼──> Cluster
Liquidation    ──┘
```

**优势**:
- ✅ 每个合约职责单一
- ✅ 独立部署和升级
- ✅ 代码复用率高
- ✅ 降低 Gas 成本

---

### 2. 🔗 **动态依赖管理**
```bash
# 建立依赖关系
fsca cluster link active 0xPriceOracle... 2

# 自动路由调用
LendingModule.getPrice() → 自动调用 → PriceOracle.getPrice()
```

**优势**:
- ✅ 运行时动态链接
- ✅ 无需硬编码地址
- ✅ 支持热替换
- ✅ 拓扑可视化

---

### 3. 🔐 **多签治理**
```bash
# 所有关键操作都需要多签确认
fsca wallet submit --to 0xCluster... --data 0x...
fsca wallet confirm 0
fsca wallet execute 0
```

**优势**:
- ✅ 去中心化治理
- ✅ 防止单点故障
- ✅ 透明的决策流程
- ✅ 符合 DAO 标准

---

### 4. ⚡ **开发效率提升 10x**
```bash
# 传统方式: 手动管理一切
hardhat compile
hardhat run scripts/deploy.js
# 手动记录地址...
# 手动配置依赖...
# 手动管理权限...

# FSCA 方式: 一键完成
fsca init
fsca cluster init
fsca deploy "MyModule"
fsca cluster mount 1 "MyModule"
# 自动归档、自动配置、自动管理 ✨
```

**优势**:
- ✅ 自动化部署流程
- ✅ 智能合约归档
- ✅ 配置自动管理
- ✅ 拓扑自动生成

---

## 🚀 快速开始

### 安装
```bash
npm install -g fsca-cli
```

### 5 分钟构建你的第一个集群
```bash
# 1. 初始化项目
fsca init

# 2. 部署集群
fsca cluster init

# 3. 部署合约
fsca deploy "LendingModule"
fsca deploy "PriceOracle"

# 4. 挂载到集群
fsca cluster mount 1 "LendingModule"
fsca cluster mount 2 "PriceOracle"

# 5. 建立依赖
fsca cluster link active 0xPriceOracle... 2

# 6. 查看拓扑
fsca cluster graph
```

**完成!** 你已经构建了一个可组合的智能合约集群 🎉

---

## 🏆 与传统方案对比

| 特性 | 传统 Hardhat | FSCA CLI |
|------|-------------|----------|
| 合约管理 | 手动 | 自动化 |
| 依赖管理 | 硬编码 | 动态链接 |
| 升级方式 | Proxy 模式 | 模块替换 |
| 治理 | 自行实现 | 内置多签 |
| 拓扑可视化 | ❌ | ✅ |
| 学习曲线 | 陡峭 | 平缓 |
| 开发效率 | 1x | 10x |

---

## 🎨 架构设计

### 三层架构
```
┌─────────────────────────────────────┐
│     CLI Layer (fsca-cli)            │  ← 开发者接口
├─────────────────────────────────────┤
│  Cluster Layer (ClusterManager)     │  ← 编排层
├─────────────────────────────────────┤
│   Contract Layer (NormalTemplate)   │  ← 业务逻辑
└─────────────────────────────────────┘
```

### 核心组件

#### 1. **NormalTemplate** (Pod)
- 标准化的合约模板
- 支持主动/被动依赖
- 内置权限管理
- 可独立部署

#### 2. **ClusterManager** (Orchestrator)
- 合约注册中心
- 依赖关系管理
- 拓扑维护
- 操作员管理

#### 3. **MultiSigWallet** (Governance)
- 多签交易管理
- 提案和投票
- 阈值配置
- 所有者管理

#### 4. **EvokerManager** (Topology)
- 依赖图维护
- 链接创建/删除
- 拓扑查询
- 关系验证

---

## 💡 使用场景

### 1. **DeFi 协议**
```
LendingPool ──┬──> PriceOracle
              ├──> InterestRate
              └──> Liquidation
```
- 模块化借贷协议
- 价格预言机集成
- 清算引擎独立

### 2. **NFT 市场**
```
Marketplace ──┬──> Auction
              ├──> Royalty
              └──> Escrow
```
- 拍卖模块可替换
- 版税计算独立
- 托管服务解耦

### 3. **DAO 治理**
```
Governor ──┬──> Timelock
           ├──> Treasury
           └──> Voting
```
- 治理逻辑模块化
- 时间锁独立管理
- 投票机制可升级

---

## 🛠️ 技术栈

- **智能合约**: Solidity 0.8+
- **开发框架**: Hardhat
- **区块链交互**: ethers.js
- **CLI 框架**: 自研 (零依赖)
- **配置管理**: JSON Schema

---

## 📊 项目统计

```
代码行数:     8,057 行
  - Solidity:   1,175 行
  - JavaScript: 4,749 行
  - 文档:       1,490 行

命令数量:     17 个
合约数量:     4 个核心合约
测试覆盖:     开发中
```

---

## 🎓 学习资源

- 📖 **用户指南**: [user-guide.md](user-guide.md) - 详细使用文档
- 🎥 **视频教程**: 开发中
- 💬 **社区支持**: [GitHub Issues](https://github.com/Steve65535/fsca-cli/issues)
- 📝 **开发路线**: [documents/roadmap.txt](documents/roadmap.txt)

---

## 🌟 核心特性

### ✅ 已实现
- [x] 项目初始化和配置
- [x] 集群部署和管理
- [x] 合约挂载/卸载
- [x] 依赖链接管理
- [x] 多签钱包治理
- [x] 拓扑图可视化
- [x] 权限管理系统
- [x] 自动化归档
- [x] 增强的帮助系统

### 🚧 开发中
- [ ] 单元测试 (80% 覆盖率)
- [ ] 安全审计
- [ ] Gas 优化
- [ ] Web Dashboard
- [ ] 插件系统

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议!

```bash
# Fork 项目
git clone https://github.com/Steve65535/fsca-cli.git
cd fsca-cli

# 安装依赖
npm install

# 运行测试
npm test

# 提交 PR
```

---

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 🔮 愿景

**短期** (1 年): 成为 Web3 开发者的首选智能合约管理工具

**中期** (3 年): 建立完整的生态系统,包括工具链、插件市场、开发者社区

**长期** (5 年): 成为智能合约编排的行业标准,类似于 Kubernetes 在容器编排领域的地位

---

## 💬 联系方式

- **GitHub**: [@Steve65535](https://github.com/Steve65535)
- **Email**: steve@fsca.io
- **Discord**: 开发中

---

<p align="center">
  <b>FSCA - 让智能合约开发像搭积木一样简单</b>
</p>

<p align="center">
  ⭐ 如果这个项目对你有帮助,请给我们一个 Star!
</p>
