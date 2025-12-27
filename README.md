# FSCA CLI (Financial Smart Contract Architecture)

> 链上智能合约集群开发工具的命令行界面。
> A revolutionary CLI for orchestrating on-chain smart contract clusters.

## 核心理念

FSCA 旨在解决传统智能合约开发中的**不可变性**与业务**灵活性**之间的矛盾。它引入了 "Contract Cluster"（合约集群）的概念，类似于微服务架构。

*   **Cluster (集群)**:  一个业务系统的整体边界。
*   **Pod (模块)**: 独立的合约单元，通过标准接口 (`NormalTemplate`) 构建。
*   **Mount (挂载)**: 将 Pod 注册到 Cluster 的过程。挂载后的 Pod 受 `EvokerManager` 权限管控。
*   **Link (链接)**: 在 Pod 之间建立逻辑连接（ID路由），支持热插拔。

## 快速开始

### 1. 安装

```bash
npm install -g fsca-cli
# 或者在源码目录
npm link
```

### 2. 初始化项目

```bash
mkdir my-defi-project
cd my-defi-project
fsca init
```
*   这会初始化 Hardhat 环境，加载 FSCA 核心合约库，并生成 `project.json` 配置文件。

### 3. 工作流 (Workflow)

FSCA 采用 **Deploy -> Choose -> Link -> Mount** 的标准化工作流。

#### Step 1: 部署合约 (Deploy)
部署一个基于 `NormalTemplate` 的标准合约。
```bash
fsca deploy "MyLendingModule"
```
*   自动编译、部署、更新本地缓存。
*   自动将新合约设为 `currentOperating` (当前操作对象)。

#### Step 2: 选择操作对象 (Choose)
如果你需要切换到其他已部署的合约进行操作：
```bash
fsca cluster choose <CONTRACT_ADDRESS>
```

#### Step 3: 建立链接 (Link)
在合约“上线”（挂载）之前，先配置好它与其他模块的连接。
```bash
# 链接一个主动调用模块 (Positive Link)
fsca cluster link positive <TARGET_ADDRESS> <TARGET_ID>

# 链接一个被动回调模块 (Passive Link)
fsca cluster link passive <TARGET_ADDRESS> <TARGET_ID>
```
*   系统会自动检测合约状态 (`wetherMounted`) 并选择正确的链上接口。

#### Step 4: 挂载上线 (Mount)
将配置好的合约正式注册到集群中。
```bash
fsca cluster mount <ID> "MyLendingModule"
```
*   合约 ID 在集群内唯一。
*   挂载后，合约正式纳入权限管理体系。

#### Step 5: 下线维护 (Unmount) / 解除链接 (Unlink)
```bash
# 从集群卸载
fsca cluster unmount <ID>

# 解除链接 (仅限挂载后)
fsca cluster unlink <TYPE> <TARGET_ADDRESS> <TARGET_ID>
```

## 命令参考

### 基础命令
*   `fsca init`: 初始化项目和环境。
*   `fsca deploy <description>`: 部署标准模板合约。

### 集群管理 (`fsca cluster`)
*   `fsca cluster init`: 部署一个新的 ClusterManager（通常 `fsca init` 已包含）。
*   `fsca cluster list mounted`: 列出当前挂载的所有合约。
*   `fsca cluster list all`: 列出历史所有合约记录。
*   `fsca cluster choose <address>`: 选择当前操作的合约上下文。
*   `fsca cluster link <type> <addr> <id>`: 链接模块 (type: `positive` | `passive`)。
*   `fsca cluster unlink <type> <addr> <id>`: 解除链接。
*   `fsca cluster mount <id> <name>`: 挂载合约到集群。
*   `fsca cluster unmount <id>`: 从集群卸载合约。

## 目录结构

```
my-fsca-project/
├── contracts/
│   ├── deployed/         # 已部署合约源码备份
│   └── undeployed/       # 核心模板代码 (fsca-core)
├── project.json          # 项目核心配置与缓存
├── hardhat.config.js     # Hardhat 配置
└── ...
```

## 贡献

欢迎提交 Issue 和 PR 改进 FSCA 架构。
