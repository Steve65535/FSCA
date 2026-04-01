# Best Practices for Building On-Chain Microservice Clusters with Arkheion CLI

> Repository: `arkheion-cli`
> Goal: Elevate from "works locally" to "production-ready, upgradeable, auditable, and rollback-capable".

## 1. Design Architecture First

Freeze a "module topology + ID plan + call direction" diagram before any on-chain operations.

- **Module boundaries**: Each Pod has a single responsibility (e.g. `Lending`, `PriceOracle`, `Liquidation`).
- **ID planning**: Use fixed ranges to avoid upgrade conflicts.
- **Call relationships**: Draw the graph before writing commands — avoid missing bidirectional auth.

Recommended ID ranges (layered governance, not random):

- `1-99`: Platform infrastructure and reserved (do not assign to business Pods)
- `100-199`: Storage Pods (long-lived, upgrade rarely)
- `200-399`: Core Logic Pods (business logic, hot-upgradeable)
- `400-599`: Adapter / Oracle / External integrations
- `600-799`: Governance and ops auxiliary modules
- `900+`: Experimental, canary, test

Storage Pod rules:

- Once assigned, a Storage ID must never be reused or have its semantics changed.
- Logic Pod upgrades always reuse the original Logic ID via `cluster upgrade --id`. Never occupy the Storage range.
- When new data models are needed, add a new Storage Pod rather than making breaking changes to an existing one.
- Shared data (global config, fee tables) should have a dedicated stable range (e.g. `180-189`).

Example (Lending domain):

- `110` `AccountStorage`
- `111` `PositionStorage`
- `112` `RiskParamStorage`
- `210` `LendingEngine`
- `211` `LiquidationEngine`
- `212` `InterestEngine`
- `410` `PriceOracleAdapter`

## 2. Environment and Configuration Management

`project.json` is the core state file. Isolate by environment:

- `project.dev.json`
- `project.test.json`
- `project.prod.json`

Before switching environments, back up the current config and verify:

- `network.rpc`
- `network.chainId`
- `account.address`
- `account.privateKey`
- `arkheion.clusterAddress` (written after `cluster init`)

In production, use `.env` (`Arkheion_PRIVATE_KEY`, `Arkheion_RPC_URL`) for secrets and node config. Never commit sensitive fields to the repository.

## 3. Recommended Deployment Flow (Golden Path)

### Step A: Initialize and deploy backbone

```bash
arkheion init
arkheion cluster init --threshold 2 --yes --cleanup keep
```

- Production: use `threshold >= 2`. Never use `1/1` multi-sig.
- After `cluster init`, run a read-only sanity check:

```bash
arkheion wallet owners
arkheion cluster operator list
```

### Step B: Deploy business Pods (deploy first, mount later)

```bash
arkheion deploy --contract LendingPod --description LendingPod --yes --cleanup soft
arkheion deploy --contract PriceOracle --description PriceOracle --yes --cleanup soft
arkheion deploy --contract LiquidationPod --description LiquidationPod --yes --cleanup soft
```

- Record the address and tx hash for each Pod immediately after deployment.
- Use `arkheion cluster choose <address>` to set context explicitly before each operation.

### Step C: Configure links before mounting

Example: `LendingPod -> PriceOracle`, `LendingPod -> LiquidationPod`:

```bash
arkheion cluster choose <LendingPod-Address>
arkheion cluster link active <PriceOracle-Address> 2
arkheion cluster link active <LiquidationPod-Address> 3
```

Use `active` / `passive` (the legacy alias `positive` still works but is not recommended).

### Step D: Mount and go live

```bash
arkheion cluster choose <LendingPod-Address>
arkheion cluster mount 1 "LendingPod"

arkheion cluster choose <PriceOracle-Address>
arkheion cluster mount 2 "PriceOracle"

arkheion cluster choose <LiquidationPod-Address>
arkheion cluster mount 3 "LiquidationPod"
```

Post-mount verification:

```bash
arkheion cluster list mounted
arkheion cluster info 1
arkheion cluster graph
```

## 4. Governance and Permission Best Practices

- `rootAdmin` is controlled by multi-sig. Never use a raw EOA for system-level mutations.
- Minimize operators — only grant to accounts that need to execute cluster operations.
- All write operations follow the flow: `submit -> confirm -> execute`, with audit records retained.
- **All invasive wallet commands have a confirmation gate**: `submit`, `confirm`, `execute`, `revoke`, and `propose` all prompt for interactive confirmation before any on-chain write. Use `--yes` to skip in CI/automation.

Typical governance commands:

```bash
# Interactive mode (prompts for confirmation)
arkheion wallet submit --to <target> --value 0 --data <hexData>
arkheion wallet confirm <txIndex>
arkheion wallet execute <txIndex>
arkheion wallet info <txIndex>

# CI/automation mode (skip confirmation)
arkheion wallet submit --to <target> --value 0 --data <hexData> --yes
arkheion wallet confirm <txIndex> --yes
arkheion wallet execute <txIndex> --yes
```

**Valid confirmations**: `wallet list`, `wallet info`, `wallet confirm`, `wallet revoke`, and `wallet execute` all display *valid confirmations* — a live recount from current owners only. After an owner is removed, the stale `numConfirmations` field is ignored and the count is recomputed. This prevents the "removed owner's confirmation still counts toward execution" vulnerability.

**ProxyWallet permission change events**: `setRightManager` and `setUserRight` both emit on-chain events (`RightManagerSet`, `UserRightSet`) for off-chain audit systems (e.g. BSPP) to track permission changes in real time. `setRightManager` is idempotent — setting the same address twice does not cause duplicate entries in the `all1s` array.

## 5. Upgrade Strategy (Zero-Downtime First)

```bash
arkheion cluster check
arkheion cluster upgrade --id <id> --contract <NewContractName> --yes --cleanup soft
```

Default behavior copies the old contract's active/passive pod relationships and remounts. Use for interface-compatible upgrades.

When the new version has significantly different dependencies:

```bash
arkheion cluster upgrade --id <id> --contract <NewContractName> --skip-copy-pods
```

Then manually rebuild links and run regression tests.

Pre-upgrade checklist:

- New contract constructor is compatible with current deployment (usually requires `clusterAddress`).
- ABI changes do not break callers.
- Rollback path is executable (old artifact and address records are complete).

## 6. Rollback and Emergency Response

Use `cluster rollback` as a standard command, not a last resort:

```bash
# View version chain
arkheion cluster history --id <id>

# Dry-run rollback (no chain writes)
arkheion cluster rollback --id <id> --dry-run

# Roll back to previous version
arkheion cluster rollback --id <id> --yes

# Roll back to a specific generation
arkheion cluster rollback --id <id> --generation <n> --yes
```

Emergency SOP:

1. Use `cluster history` to confirm the target version (`deprecated`).
2. Run `rollback --dry-run` to review the plan.
3. Execute `rollback`, then inspect `rollback-report.json`.
4. Regression: `cluster graph`, core business cases, permission cases.

## 7. Observability and Acceptance

After every structural change, run at minimum:

- `arkheion cluster graph` — verify topology matches design.
- `arkheion cluster list mounted` — verify mount set is correct.
- `arkheion normal get modules active|passive` — verify critical links exist.

Recommended CI/CD additions:

- `npx hardhat compile`
- `npx hardhat test`
- Smoke tests for key commands (deploy, link, mount, upgrade, rollback)
- Retain change logs: `logs/<date>.log`, `cleanup-report.json`, `rollback-report.json`

## 8. Implementation Pitfalls

- Use `active/passive` for `arkheion cluster link` (legacy alias `positive` still works but is not recommended).
- `arkheion deploy` requires `arkheion.clusterAddress` — run `arkheion cluster init` first.
- `arkheion cluster choose` scans the registry for state checks; performance degrades with large registries.
- `project.json` is a source of truth — include it in your change management strategy and audit trail.
- **`contractId: null` vs `@arkheion-id 0`**: Infrastructure contracts (MultiSigWallet, ClusterManager, etc.) use `contractId: null` internally. The CLI guards all numeric comparisons against `null` coercion, so `@arkheion-id 0` is safe to use for business contracts. If you have a legacy `project.json` with old infra records in `runningcontracts`, run `arkheion cluster check` to verify no conflicts exist.

## 9. Production Template (Ready to Use)

```bash
# 0) Prepare environment
cp project.prod.json project.json

# 1) Static check
arkheion cluster check

# 2) Deploy backbone
arkheion cluster init --threshold 2 --yes --cleanup keep
arkheion wallet owners
arkheion cluster operator list

# 3) Deploy business Pods
arkheion deploy --contract LendingPod --yes --cleanup soft
arkheion deploy --contract PriceOracle --yes --cleanup soft
arkheion deploy --contract LiquidationPod --yes --cleanup soft

# 4) Configure links (pre-mount)
arkheion cluster choose <LendingPod-Address>
arkheion cluster link active <PriceOracle-Address> 2
arkheion cluster link active <LiquidationPod-Address> 3

# 5) Mount and go live
arkheion cluster choose <LendingPod-Address> && arkheion cluster mount 1 "LendingPod"
arkheion cluster choose <PriceOracle-Address> && arkheion cluster mount 2 "PriceOracle"
arkheion cluster choose <LiquidationPod-Address> && arkheion cluster mount 3 "LiquidationPod"

# 6) Acceptance
arkheion cluster list mounted
arkheion cluster graph

# 7) Subsequent upgrades (check first)
arkheion cluster check
arkheion cluster upgrade --id 1 --contract LendingPodV2 --yes --cleanup soft

# 8) Emergency rollback
arkheion cluster rollback --id 1 --dry-run
arkheion cluster rollback --id 1 --yes
```

## 10. Recommended Architecture: Storage/Logic Separation

The recommended pattern for long-lived on-chain microservice clusters:

- **Storage Pods**: Persist data only. Minimal interface (`get/set`). Rarely upgraded.
- **Logic Pods**: Carry business rules. Hot-upgradeable independently.
- **Orchestration layer**: ClusterManager/EvokerManager manages dependencies and call authorization.

Core goals:

- Data addresses are stable — they don't move with business iterations.
- Business logic iterates fast via `cluster upgrade`.
- Upgrade risk is reduced by decoupling "data migration" from "logic change".

### 10.1 Data layer: double mapping

For account assets, limits, and parameters:

```solidity
mapping(uint32 => mapping(address => uint256)) private _balances;
// key1: tokenId / assetId
// key2: user address
```

Or:

```solidity
mapping(bytes32 => mapping(address => uint256)) private _kv;
// key1: domain key (e.g. keccak256("margin"|"credit"|"risk"...))
// key2: user / actor
```

Benefits:

- Natural sharding by "asset dimension × user dimension".
- New business usually only adds keys — no data migration needed.
- Logic upgrades stay compatible as long as the interface is preserved.

### 10.2 Minimize data Pod interfaces

Data contracts expose only primitives:

- `getBalance(tokenId, user)`
- `setBalance(tokenId, user, amount)`
- `getValue(namespace, user)`
- `setValue(namespace, user, amount)`

Never put in data Pods:

- Complex business rules (interest rates, liquidation, risk scoring)
- Cross-module call orchestration
- High-frequency iteration logic

### 10.3 Recommended module layers

- **L0 Data**: `AccountStorage`, `PositionStorage`, `ConfigStorage`
- **L1 Business**: `TradeEngine`, `LendingEngine`, `LiquidationEngine`
- **L2 Governance**: `ProxyWallet` + proposal workflow
- **L3 Orchestration**: `ClusterManager` + `EvokerManager`

Deployment order:

1. Deploy and mount Storage Pods first.
2. Deploy Service Pods and establish links.
3. Enable external entry points and permissions last.

## 11. Permission Model and normalTemplate Modifiers

### 11.1 Who can call what

- `onlyCluster`: Only `ClusterManager` or `EvokerManager`.
- `notMounted`: Only when `whetherMounted == 0` (unmounted).
- `checkAbiRight(abiId)`: Caller's level in `ProxyWallet._userRights` must meet the threshold.
- `activeModuleVerification(contractId)`: `msg.sender` must match the activePod address for that ID.
- `passiveModuleVerification(contractId)`: `msg.sender` must match the passivePod address for that ID.

### 11.2 Recommended usage in business contracts

```solidity
pragma solidity ^0.8.21;
import "../undeployed/lib/normaltemplate.sol";

contract TradeEngine is normalTemplate {
    constructor(address clusterAddr) normalTemplate(clusterAddr, "TradeEngine") {}

    // Only callers with sufficient ABI permission level
    function setFee(uint256 newFee)
        external
        checkAbiRight(uint256(keccak256("setFee(uint256)")))
    { ... }

    // Only the active pod with ID=3 (e.g. RiskGuard) can call
    function liquidate(address user)
        external
        activeModuleVerification(3)
    { ... }

    // Only the passive pod with ID=2 can callback
    function onSettlementCallback(bytes32 orderId)
        external
        passiveModuleVerification(2)
    { ... }
}
```

### 11.3 CLI operations

```bash
# Set context
arkheion cluster choose <Pod-Address>

# ABI permission management
arkheion normal right set <abiId> <maxRight>
arkheion normal right remove <abiId>

# Query module relationships
arkheion normal get modules active
arkheion normal get modules passive
```

## 12. Auto-Assembly Best Practices

### 12.1 Annotation template

```solidity
// @arkheion-auto yes
// @arkheion-id 2
// @arkheion-active 1,3
// @arkheion-passive 4
contract TradeEngineV2 is normalTemplate {
    // business logic
}
```

Rules:

- `@arkheion-id` must be globally unique. Never reuse.
- `@arkheion-active` / `@arkheion-passive` list target Pod IDs, comma-separated.
- Do not add `@arkheion-auto yes` to contracts not participating in auto-assembly.
- One business contract per file for clean scanning and conflict detection.

### 12.2 Command sequence

```bash
arkheion cluster check          # detect ID conflicts, missing annotations, cycles
arkheion cluster auto --dry-run # preview plan, no chain writes
arkheion cluster auto           # execute deploy/link/mount
arkheion cluster graph          # verify final topology
```

### 12.3 Production rules

- PRs must include `cluster check` and `cluster auto --dry-run` output.
- Snapshot `project.json` before executing `cluster auto` in a production change window.
- When function-level cycle warnings appear, fix the business call path before assembling.
- After auto-assembly, always run: `cluster list mounted`, `cluster info <id>`, `cluster graph`.

## 13. Version Governance

- `alldeployedcontracts` is the historical ledger. Always retain `generation`, `status`, `deploySeq`, `podSnapshot`.
- Only restore via `cluster rollback` — never manually mount old versions.
- After every upgrade or rollback:
  - `arkheion cluster history --id <id>`
  - `arkheion cluster list mounted`
  - `arkheion cluster graph`
- Cleanup policy:
  - Production: `--cleanup soft`
  - Test: `--cleanup keep` or `soft`
  - Never use `--cleanup hard` as a default in regular workflows.

## 14. References

- `README.md`
- `README.zh-CN.md`
- `user-guide.md`
- `user-guide.zh-CN.md`
- `libs/commands/cluster/upgrade.js`
- `libs/commands/cluster/rollback.js`
- `libs/commands/cluster/auto.js`
- `libs/commands/wallet/`
