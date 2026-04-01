<p align="center">
  <img src="assets/logo_banner.png" alt="Arkheion — Smart Contract Cluster Orchestrator" width="480" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/arkheion-cli"><img src="https://img.shields.io/npm/v/arkheion-cli?style=flat-square&color=4F46E5" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-06B6D4?style=flat-square" alt="License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D16-brightgreen?style=flat-square" alt="Node" /></a>
  <a href="#"><img src="https://img.shields.io/badge/solidity-%5E0.8-363636?style=flat-square&logo=solidity" alt="Solidity" /></a>
  <a href="#"><img src="https://img.shields.io/badge/framework-Hardhat-FFF100?style=flat-square&logo=data:image/png;base64," alt="Hardhat" /></a>
  <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" /></a>
</p>

<p align="center">
  <a href="README.zh-CN.md">🇨🇳 中文文档</a> ·
  <a href="user-guide.md">📖 User Guide</a> ·
  <a href="CONTRIBUTING.md">🤝 Contributing</a> ·
  <a href="SECURITY.md">🔒 Security</a>
</p>

---

# Arkheion — Full Stack Contract Architecture

> Microservice architecture for smart contracts.

Arkheion is a developer framework for building **modular, upgradeable, and system-level smart contracts**.

Instead of treating a protocol as a single contract with upgrade patterns (e.g. proxy),
Arkheion treats it as a **composable service system**:

- Each module is an isolated contract service
- State and logic are separated for safer upgrades
- Services are orchestrated through a cluster layer
- Designed for complex, long-lived systems — not just single contracts

---

## Why Arkheion?

As smart contracts evolve beyond simple applications,
**system complexity becomes the real bottleneck**:

- Monolithic contracts are hard to upgrade safely
- Modular patterns still share state and create coupling
- Complex protocols lack a clear system architecture

Arkheion introduces a new paradigm:

> **From single-contract upgrade → to system-level architecture**

---

## 1-Min Demo

```bash
arkheion init
arkheion cluster init

# Annotate your contracts, then one command does everything:
arkheion cluster auto
```

Add annotations to your contracts:

```solidity
// @arkheion-id 1
// @arkheion-active
// @arkheion-passive
// @arkheion-auto yes
contract AccountStorage is normalTemplate { ... }

// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive
// @arkheion-auto yes
contract TradeEngine is normalTemplate { ... }
```

Then run:

```bash
arkheion cluster auto check   # static analysis: ID conflicts, pod cycles, function call cycles
arkheion cluster auto         # deploy all → link all → mount all, automatically
```

---

## The Problem

Modern DApps (DeFi, GameFi, NFT marketplaces) consist of **thousands of lines of tightly coupled Solidity** crammed into a single contract or hidden behind fragile proxy patterns. Upgrading one function means redeploying the entire monolith. A single bug can drain the treasury. There is no service discovery, no dependency graph, no governance layer — just raw addresses hardcoded everywhere.

**Arkheion fixes this.**

## What is Arkheion?

Arkheion (**Full Stack Contract Architecture**) brings the mental model of **Kubernetes** to smart contract development:

| Kubernetes | Arkheion |
|------------|------|
| Cluster | `ClusterManager` — registry & router for all services |
| Pod | `NormalTemplate` — isolated, single-responsibility contract unit |
| Service Mesh | `EvokerManager` — runtime dependency graph & auth firewall |
| RBAC | `ProxyWallet` — multi-sig threshold governance |
| kubectl | `arkheion-cli` — one command to deploy, mount, link, upgrade |

```
┌─────────────────────────────────────────────────────┐
│                  arkheion-cli (Terminal)                 │ ← Developer interface
├─────────────────────────────────────────────────────┤
│  ClusterManager · EvokerManager · ProxyWallet       │ ← Orchestration layer
├─────────────────────────────────────────────────────┤
│  Pod A ←→ Pod B ←→ Pod C ←→ Pod D  ...              │ ← Business logic
└─────────────────────────────────────────────────────┘
```

Every Pod inherits from **NormalTemplate**, which injects security hooks, mount/unmount lifecycle control, and bidirectional authentication modifiers — automatically. The developer writes **pure business logic**; the framework handles the rest.

---

## Quick Start

```bash
# Install
npm install -g arkheion-cli

# Scaffold a new project
arkheion init

# Deploy the orchestration backbone (ClusterManager + EvokerManager + ProxyWallet)
arkheion cluster init

# Deploy two business contracts
arkheion deploy --contract LendingPool
arkheion deploy --contract PriceOracle

# Mount them into the cluster
arkheion cluster mount 1 "LendingPool"
arkheion cluster mount 2 "PriceOracle"

# Wire dependencies (LendingPool → PriceOracle)
arkheion cluster link active 0xOracleAddr... 2

# Visualize the topology
arkheion cluster graph
```

Or use **declarative auto-assembly** (recommended for multi-contract systems):

```bash
# Add @arkheion-* annotations to each contract, then:
arkheion cluster auto check   # validate before deploying
arkheion cluster auto         # deploy + link + mount in one command
```

---

## Core Features

### Modular Architecture
```
# Before (monolith)
contract GodContract { /* 5,000+ LOC, impossible to audit */ }

# After (Arkheion)
LendingPool  ──┐
PriceOracle  ──┼── Cluster (governed, linked, upgradable)
Liquidation  ──┘
```
- ✅ Single Responsibility per contract
- ✅ Independent deploy & upgrade cycles
- ✅ Reduced gas via smaller bytecode units

### Declarative Auto-Assembly

Annotate contracts with `@arkheion-*` tags and let the CLI handle the rest:

```solidity
// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive
// @arkheion-auto yes
contract TradeEngine is normalTemplate { ... }
```

```bash
arkheion cluster auto check   # ID conflict detection, pod cycle analysis, function call cycle detection
arkheion cluster auto         # full pipeline: deploy all → link all → mount all
arkheion cluster auto --dry-run  # preview plan without executing
```

- ✅ Automatic topological sort — deploys in dependency order
- ✅ Pod-level cycle detection — deferred to afterMount linking automatically
- ✅ Function-level call cycle detection — skips unsafe pod links, warns developer
- ✅ Reconciles against existing project state — skips already-mounted contracts

### Runtime Dependency Linking
```bash
arkheion cluster link active 0xOracle... 2    # LendingPool calls Oracle
arkheion cluster link passive 0xOracle... 2   # Oracle accepts calls from LendingPool
```
- ✅ No hardcoded addresses — ever
- ✅ Bidirectional auth verification at call time
- ✅ Topology visualization via `arkheion cluster graph`

### Zero-Downtime Hot Swap
```bash
arkheion cluster upgrade --id 2 --contract PriceOracleV2
# Old oracle is unmounted, new one takes its place — zero disruption to dependents
```
- ✅ Dependents resolve the latest address dynamically
- ✅ Link topology is preserved across upgrades
- ✅ Multi-sig approval required before execution

### Multi-Sig Governance
```bash
arkheion wallet submit --to 0xCluster... --data 0x... --yes
arkheion wallet confirm 0 --yes
arkheion wallet execute 0 --yes
```
- ✅ Every topology mutation requires threshold signatures
- ✅ All invasive wallet commands prompt for confirmation — use `--yes` in CI
- ✅ `wallet list` / `wallet info` show **live valid confirmations** (accurate after owner removal)
- ✅ Built-in proposal system (add/remove owners, change threshold)
- ✅ DAO-ready from day one

---

## Architecture

### Three-Layer Design

| Layer | Component | Role |
|-------|-----------|------|
| **CLI** | `arkheion-cli` | Developer-facing automation terminal |
| **Orchestration** | `ClusterManager` | Service registry, mount table, operator RBAC |
| | `EvokerManager` | Dependency graph, active/passive link auth |
| | `ProxyWallet` | Multi-sig threshold gate for all mutations |
| **Business** | `NormalTemplate` pods | Isolated, hookable, single-purpose contracts |

### Security Model

Every cross-contract call passes through a **zero-trust verification chain**:

```
Pod A calls Pod B
  → Pod B's modifier checks EvokerManager
    → EvokerManager verifies A is in B's passive whitelist
      → Whitelist was set via ProxyWallet multi-sig
        → Call proceeds  ✅
        → Or reverts instantly  ❌
```

No address spoofing. No unauthorized access. No exceptions.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `arkheion init` | Scaffold project + Hardhat + config |
| `arkheion deploy --contract <Name> [--cleanup <keep\|soft\|hard>] [--yes]` | Compile & deploy a NormalTemplate contract |
| `arkheion cluster init [--cleanup <keep\|soft\|hard>] [--yes]` | Deploy the orchestration backbone |
| `arkheion cluster mount <id> <name>` | Register a contract into the cluster |
| `arkheion cluster unmount <id>` | Deregister a contract |
| `arkheion cluster upgrade --id <id> --contract <Name> [--cleanup <keep\|soft\|hard>] [--yes]` | Hot-swap a contract version |
| `arkheion cluster link <type> <addr> <id>` | Create active/passive dependency |
| `arkheion cluster unlink <type> <addr> <id>` | Remove a dependency |
| `arkheion cluster auto check` | Static analysis: ID conflicts, pod cycles, function call cycles |
| `arkheion cluster auto [--dry-run] [--cleanup <keep\|soft\|hard>] [--yes]` | Declarative auto-assembly: deploy + link + mount |
| `arkheion cluster rollback --id <contractId> [--generation <n>] [--dry-run] [--yes]` | Roll back to a deprecated historical version |
| `arkheion cluster history --id <contractId>` | Inspect version history for one contract ID |
| `arkheion cluster graph` | Generate Mermaid topology diagram |
| `arkheion cluster list mounted` | List all mounted contracts |
| `arkheion cluster info <id>` | Inspect a contract's metadata |
| `arkheion cluster choose <addr>` | Set working context |
| `arkheion cluster operator add/remove <addr>` | Manage cluster operators |
| `arkheion wallet submit --to <addr> --data <hex> [--yes]` | Submit a transaction (confirmation required) |
| `arkheion wallet confirm <txIndex> [--yes]` | Confirm a transaction (confirmation required) |
| `arkheion wallet execute <txIndex> [--yes]` | Execute a transaction (confirmation required) |
| `arkheion wallet revoke <txIndex> [--yes]` | Revoke a confirmation (confirmation required) |
| `arkheion wallet list [--pending]` | List transactions with **live valid-confirmation counts** |
| `arkheion wallet info <txIndex>` | View transaction details with live confirmation count |
| `arkheion wallet owners` | View signers & threshold |
| `arkheion wallet propose add-owner <addr> [--yes]` | Propose adding an owner (confirmation required) |
| `arkheion wallet propose remove-owner <addr> [--yes]` | Propose removing an owner (confirmation required) |
| `arkheion wallet propose change-threshold <N> [--yes]` | Propose threshold change (confirmation required) |
| `arkheion normal right set/remove` | ABI-level permission control |
| `arkheion normal get modules <type>` | Query linked modules |

---

## Comparison

| Feature | Hardhat (vanilla) | OpenZeppelin Upgrades | Diamond (EIP-2535) | **Arkheion** |
|---------|-------------------|-----------------------|---------------------|----------|
| Modular contracts | ❌ | ❌ | ✅ (facets) | ✅ (pods) |
| Runtime linking | ❌ | ❌ | ❌ | ✅ |
| Dependency graph | ❌ | ❌ | ❌ | ✅ |
| Hot swap upgrade | ❌ | ✅ (proxy) | ✅ (facets) | ✅ (mount) |
| Multi-sig governance | ❌ | ❌ | ❌ | ✅ built-in |
| Topology visualization | ❌ | ❌ | ❌ | ✅ Mermaid |
| Declarative auto-assembly | ❌ | ❌ | ❌ | ✅ |
| Cycle detection (pod + function) | ❌ | ❌ | ❌ | ✅ |
| CLI automation | Partial | Partial | ❌ | ✅ full |
| Zero-trust auth | ❌ | ❌ | ❌ | ✅ |

---

## Project Stats

```
Total Lines of Code:   8,500+
  Solidity:            1,175  (4 core contracts)
  JavaScript:          5,200+ (20 CLI commands + auto-assembly subsystem)
  Documentation:       1,800+
  Tests:               325 unit tests (Jest, all passing)
```

---

## Roadmap

- [x] Core orchestration contracts (ClusterManager, EvokerManager, ProxyWallet)
- [x] NormalTemplate with security hooks
- [x] Full CLI with 20 commands
- [x] Multi-sig governance
- [x] Hot-swap upgrade command
- [x] Topology graph generation
- [x] Declarative auto-assembly (`arkheion cluster auto`)
- [x] Pod-level & function-level cycle detection
- [x] Unit tests (115 passing, Jest)
- [ ] 80%+ test coverage
- [ ] Slither / Mythril security audit
- [ ] Gas optimization (calldata, indexed events)
- [ ] Web Dashboard (React + D3.js)
- [ ] Plugin system
- [ ] EIP proposal for contract orchestration standard

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

```bash
git clone https://github.com/Steve65535/arkheion-cli.git
cd arkheion-cli
npm install
npm test
```

---

## License

[Apache-2.0](LICENSE) © Steve65535

---

## Links

- 📖 **User Guide**: [English](user-guide.md) · [中文](user-guide.zh-CN.md)
- 🗺️ **Roadmap**: [documents/roadmap.txt](documents/roadmap.txt)
- 🐛 **Issues**: [GitHub Issues](https://github.com/Steve65535/arkheion-cli/issues)
- 💬 **Contact**: [@Steve65535](https://github.com/Steve65535)

---

<p align="center">
  <sub>Arkheion — Build smart contracts like microservices.</sub>
</p>
