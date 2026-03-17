# FSCA CBS Local Test Notes

This document records the issues found while replaying the Manual Sei CBS flow in `/Users/steve/Desktop/Test`, the root causes, and the fixes applied.

## Final Result

The local test flow was completed successfully:

1. `fsca deploy --contract AccountStorage`
2. `fsca deploy --contract TradeEngineV1`
3. `fsca deploy --contract RiskGuardV1`
4. Mount `AccountStorage`
5. Mount `RiskGuardV1`
6. Link `TradeEngineV1 -> AccountStorage`
7. Link `TradeEngineV1 -> RiskGuardV1`
8. Mount `TradeEngineV1`
9. `fsca cluster upgrade --id 2 --contract TradeEngineV2`
10. Final `cluster list mounted`, `cluster info 2`, `cluster graph`

## Issues Found And Why

### 1. Business contract imports still pointed to the old demo layout

Problem:

- `AccountStorage.sol`, `TradeEngineV1.sol`, `TradeEngineV2.sol`, `RiskGuardV1.sol`
- These files were importing `../core/lib/...`
- Real FSCA project layout uses `undeployed/lib`, `undeployed/structure`, `undeployed/wallet`

Why it failed:

- The demo contracts were written against a split `core/` vs `undeployed/` layout.
- The real build project in `Test` is a self-contained `contracts/undeployed` package.

Fix:

- Point business contracts to `./lib/...`

### 2. Interface imports were not self-contained

Problem:

- `TradeEngineV1.sol` and `TradeEngineV2.sol` imported `../interfaces/...`

Why it failed:

- In `Test`, interfaces live under `contracts/undeployed/interfaces`
- `../interfaces/...` resolves to `contracts/interfaces/...`, which does not exist

Fix:

- Add `contracts/undeployed/interfaces/IAccountStorage.sol`
- Add `contracts/undeployed/interfaces/IRiskGuard.sol`
- Change imports to `./interfaces/...`

### 3. `getActiveModuleAddress()` was not callable from child contracts

Problem:

- `TradeEngineV1` and `TradeEngineV2` call `getActiveModuleAddress(...)`

Why it failed:

- In `contracts/undeployed/lib/normaltemplate.sol`, both:
  - `getActiveModuleAddress`
  - `getPassiveModuleAddress`
  were still `external`
- Child contracts cannot directly call them as inherited internal helpers

Fix:

- Change both functions from `external` to `public`

### 4. Hardhat compiled `contracts/deployed` and picked up broken historical files

Problem:

- Compilation failed on `contracts/deployed/structure/clustermanager.sol`

Why it failed:

- `hardhat.config.js` used the default `contracts` source root
- That caused Hardhat to compile both:
  - `contracts/undeployed`
  - `contracts/deployed`
- `contracts/deployed` contains historical archive copies, not live source-of-truth
- Those archived files have imports that are not valid as compilation roots

Fix:

- Restrict Hardhat `sources` to `./contracts/undeployed`

## Important Behavioral Finding

### The real implementation does NOT support the documented "link everything before mount" flow

The manual guide currently says:

1. deploy
2. link
3. mount

But the actual `ClusterManager` implementation in this project behaves differently.

Why:

- `addActivePodBeforeMount` and `addPassivePodBeforeMount` both require:

```solidity
require(addrToId[targetAddr] == targetId, "target id and addr dismatch");
```

- `addrToId[targetAddr]` is only populated after `registerContract(...)`
- `registerContract(...)` happens during `mount`

That means:

- You cannot `beforeMount link` to a target that has never been mounted
- The target contract must already be registered in the cluster

## Actual Working Order

The real working order in `Test` is:

1. Deploy all business contracts
2. Mount leaf / target contracts first
   - `AccountStorage`
   - `RiskGuardV1`
3. Choose the still-unmounted source contract
   - `TradeEngineV1`
4. Add `beforeMount` links from source to already-mounted targets
5. Mount the source contract

In concrete commands:

```bash
fsca cluster choose "$STORAGE"
fsca cluster mount 1 AccountStorage

fsca cluster choose "$RISK"
fsca cluster mount 3 RiskGuardV1

fsca cluster choose "$TRADE"
fsca cluster link positive "$STORAGE" 1
fsca cluster link positive "$RISK" 3
fsca cluster mount 2 TradeEngineV1
```

## Verified End State

- `AccountStorage` mounted at ID `1`
- `RiskGuardV1` mounted at ID `3`
- `TradeEngineV1` mounted at ID `2`
- Hot upgrade `TradeEngineV1 -> TradeEngineV2` completed successfully
- After upgrade, ID `2` pointed to the new contract address
- `cluster-topology.html` was generated successfully before and after upgrade

## Graph Limitation Found

The current `cluster graph` output is useful for topology shape, but it is not sufficient to prove hot swap by itself.

Why:

- Nodes currently render as:
  - contract name
  - contract ID
- Nodes do not render the actual contract address
- The manager node only renders a shortened address

Current graph consequence:

- Before upgrade and after upgrade, the topology can look visually identical
- A viewer can confirm that the structure is preserved
- But a viewer cannot prove from the graph alone that:
  - ID `2` moved from the old `TradeEngineV1` address
  - to the new `TradeEngineV2` deployment address

This matters because the strongest hot-upgrade proof is:

1. same logical ID
2. same dependency topology
3. different implementation address

At the moment, point `3` must be shown by `cluster info 2` or terminal logs, not by the graph itself.

## Recommended Next Cleanup

1. Update `MANUAL_SEI_CBS_GUIDE.md` to reflect the real mount/link order
2. Keep the `undeployed` package fully self-contained
3. Treat `contracts/deployed` as archive only, never as compile source
4. Update `cluster graph` so each node can display an address
5. Consider aligning all template copies so `core` and `undeployed` do not drift
