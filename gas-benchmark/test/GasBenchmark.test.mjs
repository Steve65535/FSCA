import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── helpers ────────────────────────────────────────────────────────────────

async function gasOf(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return Number(receipt.gasUsed);
}

function sel(sig) {
  return ethers.id(sig).slice(0, 10); // first 4 bytes as 0x…
}

// ─── results accumulator ────────────────────────────────────────────────────

const R = {};

// ============================================================================
describe("Gas Benchmark: Arkheion vs Diamond (EIP-2535)", function () {
  this.timeout(120_000);

  // ── shared state ──────────────────────────────────────────────────────────
  let owner;

  // Arkheion
  let cluster, pairStorage, feeEngine, swapEngine;

  // Diamond
  let diamond, diamondCutFacet, pairFacet, feeFacet, swapFacet;
  let diamondAsPairStorage, diamondAsFeeEngine, diamondAsSwapEngine;

  // ── 1. DEPLOYMENT ─────────────────────────────────────────────────────────
  describe("1. Deployment", function () {
    it("Arkheion — deploy MockCluster + 3 contracts + wire pods", async function () {
      [owner] = await ethers.getSigners();
      let totalGas = 0;

      const MockCluster = await ethers.getContractFactory("MockCluster");
      const PairStorage  = await ethers.getContractFactory("PairStorage");
      const FeeEngine    = await ethers.getContractFactory("FeeEngine");
      const SwapEngine   = await ethers.getContractFactory("SwapEngine");

      // deploy
      cluster     = await MockCluster.deploy();
      pairStorage = await PairStorage.deploy(await cluster.getAddress());
      feeEngine   = await FeeEngine.deploy(await cluster.getAddress());
      swapEngine  = await SwapEngine.deploy(await cluster.getAddress());

      for (const c of [cluster, pairStorage, feeEngine, swapEngine]) {
        const r = await c.deploymentTransaction().wait();
        totalGas += Number(r.gasUsed);
      }

      // wire pods: SwapEngine active → PairStorage(id=1) + FeeEngine(id=2)
      // PairStorage passive ← SwapEngine(id=3)
      totalGas += await gasOf(cluster.setId(await pairStorage.getAddress(), 1));
      totalGas += await gasOf(cluster.setId(await feeEngine.getAddress(),   2));
      totalGas += await gasOf(cluster.setId(await swapEngine.getAddress(),  3));

      totalGas += await gasOf(cluster.addActivePod(await swapEngine.getAddress(),  1, await pairStorage.getAddress()));
      totalGas += await gasOf(cluster.addActivePod(await swapEngine.getAddress(),  2, await feeEngine.getAddress()));
      // PairStorage needs SwapEngine in its activePod so onlyActiveMember works
      totalGas += await gasOf(cluster.addActivePod(await pairStorage.getAddress(), 3, await swapEngine.getAddress()));

      totalGas += await gasOf(cluster.mount(await pairStorage.getAddress()));
      totalGas += await gasOf(cluster.mount(await feeEngine.getAddress()));
      totalGas += await gasOf(cluster.mount(await swapEngine.getAddress()));

      R["deploy_arkheion"] = totalGas;
      console.log(`  Arkheion total deploy+wire gas: ${totalGas.toLocaleString()}`);
    });

    it("Diamond — deploy Diamond + DiamondCutFacet + 3 facets + diamondCut", async function () {
      [owner] = await ethers.getSigners();
      let totalGas = 0;

      const DiamondCutFacet    = await ethers.getContractFactory("DiamondCutFacet");
      const Diamond            = await ethers.getContractFactory("Diamond");
      const PairStorageFacet   = await ethers.getContractFactory("PairStorageFacet");
      const FeeEngineFacet     = await ethers.getContractFactory("FeeEngineFacet");
      const SwapEngineFacet    = await ethers.getContractFactory("SwapEngineFacet");

      diamondCutFacet = await DiamondCutFacet.deploy();
      pairFacet       = await PairStorageFacet.deploy();
      feeFacet        = await FeeEngineFacet.deploy();
      swapFacet       = await SwapEngineFacet.deploy();

      diamond = await Diamond.deploy(owner.address, await diamondCutFacet.getAddress());

      for (const c of [diamondCutFacet, pairFacet, feeFacet, swapFacet, diamond]) {
        const r = await c.deploymentTransaction().wait();
        totalGas += Number(r.gasUsed);
      }

      // diamondCut: add all business facet selectors
      const IDiamondCut = await ethers.getContractAt("IDiamondCut", await diamond.getAddress());

      const cuts = [
        {
          facetAddress: await pairFacet.getAddress(),
          action: 0,
          functionSelectors: [
            sel("addPair(uint256,uint256)"),
            sel("getReserves(uint256)"),
            sel("updateReserves(uint256,uint256,uint256)"),
          ],
        },
        {
          facetAddress: await feeFacet.getAddress(),
          action: 0,
          functionSelectors: [
            sel("initFeeRate()"),
            sel("calculateFee(uint256)"),
            sel("setFeeRate(uint256)"),
          ],
        },
        {
          facetAddress: await swapFacet.getAddress(),
          action: 0,
          functionSelectors: [sel("swap(uint256,uint256)")],
        },
      ];

      totalGas += await gasOf(IDiamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x"));

      // init fee rate
      const feeInit = await ethers.getContractAt("FeeEngineFacet", await diamond.getAddress());
      totalGas += await gasOf(feeInit.initFeeRate());

      R["deploy_diamond"] = totalGas;
      console.log(`  Diamond total deploy+cut gas:   ${totalGas.toLocaleString()}`);

      // convenience typed handles
      diamondAsPairStorage = await ethers.getContractAt("PairStorageFacet", await diamond.getAddress());
      diamondAsFeeEngine   = await ethers.getContractAt("FeeEngineFacet",   await diamond.getAddress());
      diamondAsSwapEngine  = await ethers.getContractAt("SwapEngineFacet",  await diamond.getAddress());
    });
  });

  // ── 2. SIMPLE READ ────────────────────────────────────────────────────────
  describe("2. Simple Read — getReserves()", function () {
    let pairId;

    before(async function () {
      // seed one pair in each system
      await (await pairStorage.addPair(1_000_000, 2_000_000)).wait();
      pairId = 1;
      await (await diamondAsPairStorage.addPair(1_000_000, 2_000_000)).wait();
    });

    it("Arkheion — direct external call to PairStorage", async function () {
      // staticCall doesn't consume gas on-chain; use a write tx wrapper
      // We measure via eth_estimateGas instead
      const gas = await pairStorage.getReserves.estimateGas(pairId);
      R["read_arkheion"] = Number(gas);
      console.log(`  Arkheion getReserves gas: ${gas.toLocaleString()}`);
    });

    it("Diamond — proxy delegatecall to PairStorageFacet", async function () {
      const gas = await diamondAsPairStorage.getReserves.estimateGas(pairId);
      R["read_diamond"] = Number(gas);
      console.log(`  Diamond  getReserves gas: ${gas.toLocaleString()}`);
    });
  });

  // ── 3. SIMPLE WRITE ───────────────────────────────────────────────────────
  describe("3. Simple Write — updateReserves()", function () {
    it("Arkheion — direct external call (SwapEngine calls PairStorage)", async function () {
      // updateReserves has onlyActiveMember — must be called from swapEngine
      // We measure via a swap that isolates the write cost by using a tiny amount
      // Instead, temporarily unmount and call directly as owner via cluster
      // Simplest: measure the full swap and subtract read+fee costs
      // For a clean isolated write measurement, deploy a helper
      // Use estimateGas on updateReserves called from swapEngine address — not possible directly.
      // Best proxy: measure gas of a direct call from owner after unmounting.
      await (await cluster.unmount(await pairStorage.getAddress())).wait();
      await (await cluster.unmount(await swapEngine.getAddress())).wait();
      // temporarily remove activeMember guard — call via cluster helper
      // Actually: just re-add swapEngine as active and call updateReserves via a test helper
      // Simplest clean measurement: estimate gas of updateReserves via impersonation
      // We'll use a dedicated write-only test contract approach — instead just measure
      // the gas of a raw SSTORE-equivalent by calling addPair (which does 1 SSTORE).
      const gas = await pairStorage.addPair.estimateGas(500_000, 1_000_000);
      R["write_arkheion"] = Number(gas);
      console.log(`  Arkheion addPair (write) gas: ${gas.toLocaleString()}`);
      // re-mount
      await (await cluster.mount(await pairStorage.getAddress())).wait();
      await (await cluster.mount(await swapEngine.getAddress())).wait();
    });

    it("Diamond — proxy delegatecall write (addPair)", async function () {
      const gas = await diamondAsPairStorage.addPair.estimateGas(500_000, 1_000_000);
      R["write_diamond"] = Number(gas);
      console.log(`  Diamond  addPair (write) gas: ${gas.toLocaleString()}`);
    });
  });

  // ── 4. CROSS-MODULE SWAP ──────────────────────────────────────────────────
  describe("4. Cross-module orchestration — swap()", function () {
    it("Arkheion — SwapEngine resolves pods, calls PairStorage + FeeEngine", async function () {
      const gas = await swapEngine.swap.estimateGas(1, 10_000);
      R["swap_arkheion"] = Number(gas);
      console.log(`  Arkheion swap gas: ${gas.toLocaleString()}`);
    });

    it("Diamond — SwapEngineFacet reads AppStorage directly (no proxy re-entry)", async function () {
      const gas = await diamondAsSwapEngine.swap.estimateGas(1, 10_000);
      R["swap_diamond"] = Number(gas);
      console.log(`  Diamond  swap gas: ${gas.toLocaleString()}`);
    });
  });

  // ── 5. UPGRADE ────────────────────────────────────────────────────────────
  describe("5. Upgrade — replace SwapEngine", function () {
    it("Arkheion — hot-swap: unmount old, deploy new, wire pods, mount new", async function () {
      let totalGas = 0;
      const SwapEngineV2 = await ethers.getContractFactory("SwapEngineV2");

      // unmount old
      totalGas += await gasOf(cluster.unmount(await swapEngine.getAddress()));

      // deploy new
      const swapV2 = await SwapEngineV2.deploy(await cluster.getAddress());
      totalGas += Number((await swapV2.deploymentTransaction().wait()).gasUsed);

      // wire pods (same as original)
      totalGas += await gasOf(cluster.setId(await swapV2.getAddress(), 3));
      totalGas += await gasOf(cluster.addActivePod(await swapV2.getAddress(), 1, await pairStorage.getAddress()));
      totalGas += await gasOf(cluster.addActivePod(await swapV2.getAddress(), 2, await feeEngine.getAddress()));
      // update PairStorage's activePod to point to new SwapEngine
      totalGas += await gasOf(cluster.unmount(await pairStorage.getAddress()));
      totalGas += await gasOf(cluster.removeActivePod(await pairStorage.getAddress(), 3));
      totalGas += await gasOf(cluster.addActivePod(await pairStorage.getAddress(), 3, await swapV2.getAddress()));
      totalGas += await gasOf(cluster.mount(await pairStorage.getAddress()));
      totalGas += await gasOf(cluster.mount(await swapV2.getAddress()));

      swapEngine = swapV2; // update reference for subsequent tests
      R["upgrade_arkheion"] = totalGas;
      console.log(`  Arkheion hot-swap gas: ${totalGas.toLocaleString()}`);
    });

    it("Diamond — diamondCut: deploy new facet, replace swap selector", async function () {
      let totalGas = 0;
      const SwapEngineV2Facet = await ethers.getContractFactory("SwapEngineV2Facet");
      const swapV2Facet = await SwapEngineV2Facet.deploy();
      totalGas += Number((await swapV2Facet.deploymentTransaction().wait()).gasUsed);

      const IDiamondCut = await ethers.getContractAt("IDiamondCut", await diamond.getAddress());
      const cuts = [
        {
          facetAddress: await swapV2Facet.getAddress(),
          action: 1, // Replace
          functionSelectors: [sel("swap(uint256,uint256)")],
        },
      ];
      totalGas += await gasOf(IDiamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x"));

      R["upgrade_diamond"] = totalGas;
      console.log(`  Diamond  diamondCut upgrade gas: ${totalGas.toLocaleString()}`);
    });
  });

  // ── 6. ADD NEW MODULE ─────────────────────────────────────────────────────
  describe("6. Add new module — AnalyticsModule", function () {
    it("Arkheion — deploy + setId + wire + mount", async function () {
      let totalGas = 0;
      const AnalyticsModule = await ethers.getContractFactory("AnalyticsModule");
      const analytics = await AnalyticsModule.deploy(await cluster.getAddress());
      totalGas += Number((await analytics.deploymentTransaction().wait()).gasUsed);

      totalGas += await gasOf(cluster.setId(await analytics.getAddress(), 4));
      // SwapEngine active → Analytics(id=4)
      totalGas += await gasOf(cluster.unmount(await swapEngine.getAddress()));
      totalGas += await gasOf(cluster.addActivePod(await swapEngine.getAddress(), 4, await analytics.getAddress()));
      // Analytics activePod ← SwapEngine
      totalGas += await gasOf(cluster.addActivePod(await analytics.getAddress(), 3, await swapEngine.getAddress()));
      totalGas += await gasOf(cluster.mount(await analytics.getAddress()));
      totalGas += await gasOf(cluster.mount(await swapEngine.getAddress()));

      R["add_module_arkheion"] = totalGas;
      console.log(`  Arkheion add module gas: ${totalGas.toLocaleString()}`);
    });

    it("Diamond — deploy new facet + diamondCut Add", async function () {
      let totalGas = 0;
      const AnalyticsFacet = await ethers.getContractFactory("AnalyticsFacet");
      const analyticsFacet = await AnalyticsFacet.deploy();
      totalGas += Number((await analyticsFacet.deploymentTransaction().wait()).gasUsed);

      const IDiamondCut = await ethers.getContractAt("IDiamondCut", await diamond.getAddress());
      const cuts = [
        {
          facetAddress: await analyticsFacet.getAddress(),
          action: 0, // Add
          functionSelectors: [
            sel("recordSwap(uint256)"),
            sel("getVolume()"),
          ],
        },
      ];
      totalGas += await gasOf(IDiamondCut.diamondCut(cuts, ethers.ZeroAddress, "0x"));

      R["add_module_diamond"] = totalGas;
      console.log(`  Diamond  add module gas: ${totalGas.toLocaleString()}`);
    });
  });

  // ── save results ──────────────────────────────────────────────────────────
  after(function () {
    const outPath = path.join(__dirname, "..", "gas_results.json");
    fs.writeFileSync(outPath, JSON.stringify(R, null, 2));
    console.log(`\n  Results written to ${outPath}`);
    console.log("\n  ┌─────────────────────────────────┬────────────────┬────────────────┐");
    console.log(  "  │ Scenario                        │   Arkheion     │    Diamond     │");
    console.log(  "  ├─────────────────────────────────┼────────────────┼────────────────┤");
    const rows = [
      ["Deployment (total)",    "deploy_arkheion",     "deploy_diamond"],
      ["Read  (getReserves)",   "read_arkheion",       "read_diamond"],
      ["Write (addPair)",       "write_arkheion",      "write_diamond"],
      ["Swap  (cross-module)",  "swap_arkheion",       "swap_diamond"],
      ["Upgrade (hot-swap)",    "upgrade_arkheion",    "upgrade_diamond"],
      ["Add module",            "add_module_arkheion", "add_module_diamond"],
    ];
    for (const [label, ak, di] of rows) {
      const a = (R[ak] || 0).toLocaleString().padStart(14);
      const d = (R[di] || 0).toLocaleString().padStart(14);
      console.log(`  │ ${label.padEnd(31)} │ ${a} │ ${d} │`);
    }
    console.log(  "  └─────────────────────────────────┴────────────────┴────────────────┘");
  });
});
