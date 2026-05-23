import { network, artifacts } from "hardhat";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── setup ──────────────────────────────────────────────────────────────────

const conn     = await network.create();
const provider = new ethers.BrowserProvider(conn.provider);
const signer   = await provider.getSigner();

async function getContractFactory(name) {
  const art = await artifacts.readArtifact(name);
  return new ethers.ContractFactory(art.abi, art.bytecode, signer);
}
async function getContractAt(name, address) {
  const art = await artifacts.readArtifact(name);
  return new ethers.Contract(address, art.abi, signer);
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function gasOf(txPromise) {
  const tx      = await txPromise;
  const receipt = await tx.wait();
  return Number(receipt.gasUsed);
}

function sel(sig) {
  return ethers.id(sig).slice(0, 10);
}

function log(msg)     { console.log(msg); }
function section(t)   { log(`\n${"─".repeat(60)}\n  ${t}\n${"─".repeat(60)}`); }

// ─── results ────────────────────────────────────────────────────────────────

const R = {};

// ── 1. DEPLOYMENT ────────────────────────────────────────────────────────────
section("1. Deployment");

// Arkheion
let cluster, pairStorage, feeEngine, swapEngine;
{
  let g = 0;
  const MockCluster = await getContractFactory("MockCluster");
  const PairStorage  = await getContractFactory("PairStorage");
  const FeeEngine    = await getContractFactory("FeeEngine");
  const SwapEngine   = await getContractFactory("SwapEngine");

  cluster     = await MockCluster.deploy();
  pairStorage = await PairStorage.deploy(await cluster.getAddress());
  feeEngine   = await FeeEngine.deploy(await cluster.getAddress());
  swapEngine  = await SwapEngine.deploy(await cluster.getAddress());

  for (const c of [cluster, pairStorage, feeEngine, swapEngine]) {
    g += Number((await c.deploymentTransaction().wait()).gasUsed);
  }

  const psAddr = await pairStorage.getAddress();
  const feAddr = await feeEngine.getAddress();
  const seAddr = await swapEngine.getAddress();

  g += await gasOf(cluster.setId(psAddr, 1));
  g += await gasOf(cluster.setId(feAddr, 2));
  g += await gasOf(cluster.setId(seAddr, 3));
  g += await gasOf(cluster.addActivePod(seAddr, 1, psAddr));
  g += await gasOf(cluster.addActivePod(seAddr, 2, feAddr));
  g += await gasOf(cluster.addActivePod(psAddr, 3, seAddr));
  g += await gasOf(cluster.mount(psAddr));
  g += await gasOf(cluster.mount(feAddr));
  g += await gasOf(cluster.mount(seAddr));

  R.deploy_arkheion = g;
  log(`  Arkheion deploy+wire: ${g.toLocaleString()} gas`);
}

// Diamond
let diamond, asPair, asSwap;
{
  let g = 0;
  const DiamondCutFacet  = await getContractFactory("DiamondCutFacet");
  const Diamond          = await getContractFactory("Diamond");
  const PairStorageFacet = await getContractFactory("PairStorageFacet");
  const FeeEngineFacet   = await getContractFactory("FeeEngineFacet");
  const SwapEngineFacet  = await getContractFactory("SwapEngineFacet");

  const cutFacet  = await DiamondCutFacet.deploy();
  const pairFacet = await PairStorageFacet.deploy();
  const feeFacet  = await FeeEngineFacet.deploy();
  const swapFacet = await SwapEngineFacet.deploy();
  diamond         = await Diamond.deploy(signer.address, await cutFacet.getAddress());

  for (const c of [cutFacet, pairFacet, feeFacet, swapFacet, diamond]) {
    g += Number((await c.deploymentTransaction().wait()).gasUsed);
  }

  const iCut = await getContractAt("IDiamondCut", await diamond.getAddress());
  const cuts = [
    { facetAddress: await pairFacet.getAddress(), action: 0,
      functionSelectors: [sel("addPair(uint256,uint256)"), sel("getReserves(uint256)"), sel("updateReserves(uint256,uint256,uint256)")] },
    { facetAddress: await feeFacet.getAddress(), action: 0,
      functionSelectors: [sel("initFeeRate()"), sel("calculateFee(uint256)"), sel("setFeeRate(uint256)")] },
    { facetAddress: await swapFacet.getAddress(), action: 0,
      functionSelectors: [sel("swap(uint256,uint256)")] },
  ];
  g += await gasOf(iCut.diamondCut(cuts, ethers.ZeroAddress, "0x"));

  const feeInit = await getContractAt("FeeEngineFacet", await diamond.getAddress());
  g += await gasOf(feeInit.initFeeRate());

  R.deploy_diamond = g;
  log(`  Diamond  deploy+cut:  ${g.toLocaleString()} gas`);

  asPair = await getContractAt("PairStorageFacet", await diamond.getAddress());
  asSwap = await getContractAt("SwapEngineFacet",  await diamond.getAddress());
}

// ── 2. SIMPLE READ ───────────────────────────────────────────────────────────
section("2. Simple Read — getReserves()");

await (await pairStorage.addPair(1_000_000, 2_000_000)).wait();
await (await asPair.addPair(1_000_000, 2_000_000)).wait();

R.read_arkheion = Number(await pairStorage.getReserves.estimateGas(1));
R.read_diamond  = Number(await asPair.getReserves.estimateGas(1));
log(`  Arkheion getReserves: ${R.read_arkheion.toLocaleString()} gas`);
log(`  Diamond  getReserves: ${R.read_diamond.toLocaleString()} gas`);

// ── 3. SIMPLE WRITE ──────────────────────────────────────────────────────────
section("3. Simple Write — addPair() (1 SSTORE)");

await (await cluster.unmount(await pairStorage.getAddress())).wait();
await (await cluster.unmount(await swapEngine.getAddress())).wait();

R.write_arkheion = Number(await pairStorage.addPair.estimateGas(500_000, 1_000_000));
R.write_diamond  = Number(await asPair.addPair.estimateGas(500_000, 1_000_000));
log(`  Arkheion addPair: ${R.write_arkheion.toLocaleString()} gas`);
log(`  Diamond  addPair: ${R.write_diamond.toLocaleString()} gas`);

await (await cluster.mount(await pairStorage.getAddress())).wait();
await (await cluster.mount(await swapEngine.getAddress())).wait();

// ── 4. CROSS-MODULE SWAP ─────────────────────────────────────────────────────
section("4. Cross-module orchestration — swap()");

R.swap_arkheion = Number(await swapEngine.swap.estimateGas(1, 10_000));
R.swap_diamond  = Number(await asSwap.swap.estimateGas(1, 10_000));
log(`  Arkheion swap: ${R.swap_arkheion.toLocaleString()} gas`);
log(`  Diamond  swap: ${R.swap_diamond.toLocaleString()} gas`);

// ── 5. UPGRADE ───────────────────────────────────────────────────────────────
section("5. Upgrade — replace SwapEngine");

// Arkheion hot-swap
{
  let g = 0;
  const SwapEngineV2 = await getContractFactory("SwapEngineV2");

  g += await gasOf(cluster.unmount(await swapEngine.getAddress()));

  const swapV2 = await SwapEngineV2.deploy(await cluster.getAddress());
  g += Number((await swapV2.deploymentTransaction().wait()).gasUsed);

  const v2Addr = await swapV2.getAddress();
  const psAddr = await pairStorage.getAddress();
  const feAddr = await feeEngine.getAddress();

  g += await gasOf(cluster.setId(v2Addr, 3));
  g += await gasOf(cluster.addActivePod(v2Addr, 1, psAddr));
  g += await gasOf(cluster.addActivePod(v2Addr, 2, feAddr));
  g += await gasOf(cluster.unmount(psAddr));
  g += await gasOf(cluster.removeActivePod(psAddr, 3));
  g += await gasOf(cluster.addActivePod(psAddr, 3, v2Addr));
  g += await gasOf(cluster.mount(psAddr));
  g += await gasOf(cluster.mount(v2Addr));

  swapEngine = swapV2;
  R.upgrade_arkheion = g;
  log(`  Arkheion hot-swap: ${g.toLocaleString()} gas`);
}

// Diamond diamondCut replace
{
  let g = 0;
  const SwapEngineV2Facet = await getContractFactory("SwapEngineV2Facet");
  const swapV2Facet = await SwapEngineV2Facet.deploy();
  g += Number((await swapV2Facet.deploymentTransaction().wait()).gasUsed);

  const iCut = await getContractAt("IDiamondCut", await diamond.getAddress());
  g += await gasOf(iCut.diamondCut(
    [{ facetAddress: await swapV2Facet.getAddress(), action: 1,
       functionSelectors: [sel("swap(uint256,uint256)")] }],
    ethers.ZeroAddress, "0x"
  ));

  R.upgrade_diamond = g;
  log(`  Diamond  diamondCut: ${g.toLocaleString()} gas`);
}

// ── 6. ADD NEW MODULE ────────────────────────────────────────────────────────
section("6. Add new module — Analytics");

// Arkheion
{
  let g = 0;
  const AnalyticsModule = await getContractFactory("AnalyticsModule");
  const analytics = await AnalyticsModule.deploy(await cluster.getAddress());
  g += Number((await analytics.deploymentTransaction().wait()).gasUsed);

  const anAddr = await analytics.getAddress();
  const seAddr = await swapEngine.getAddress();

  g += await gasOf(cluster.setId(anAddr, 4));
  g += await gasOf(cluster.unmount(seAddr));
  g += await gasOf(cluster.addActivePod(seAddr, 4, anAddr));
  g += await gasOf(cluster.addActivePod(anAddr, 3, seAddr));
  g += await gasOf(cluster.mount(anAddr));
  g += await gasOf(cluster.mount(seAddr));

  R.add_module_arkheion = g;
  log(`  Arkheion add module: ${g.toLocaleString()} gas`);
}

// Diamond
{
  let g = 0;
  const AnalyticsFacet = await getContractFactory("AnalyticsFacet");
  const analyticsFacet = await AnalyticsFacet.deploy();
  g += Number((await analyticsFacet.deploymentTransaction().wait()).gasUsed);

  const iCut = await getContractAt("IDiamondCut", await diamond.getAddress());
  g += await gasOf(iCut.diamondCut(
    [{ facetAddress: await analyticsFacet.getAddress(), action: 0,
       functionSelectors: [sel("recordSwap(uint256)"), sel("getVolume()")] }],
    ethers.ZeroAddress, "0x"
  ));

  R.add_module_diamond = g;
  log(`  Diamond  add module: ${g.toLocaleString()} gas`);
}

// ── summary ──────────────────────────────────────────────────────────────────
section("Results Summary");

const rows = [
  ["Deployment (total)",   "deploy_arkheion",    "deploy_diamond"],
  ["Read  (getReserves)",  "read_arkheion",       "read_diamond"],
  ["Write (addPair)",      "write_arkheion",      "write_diamond"],
  ["Swap  (cross-module)", "swap_arkheion",       "swap_diamond"],
  ["Upgrade",              "upgrade_arkheion",    "upgrade_diamond"],
  ["Add module",           "add_module_arkheion", "add_module_diamond"],
];

log("  ┌─────────────────────────────────┬────────────────┬────────────────┬──────────┐");
log("  │ Scenario                        │   Arkheion     │    Diamond     │  Delta   │");
log("  ├─────────────────────────────────┼────────────────┼────────────────┼──────────┤");
for (const [label, ak, di] of rows) {
  const a = R[ak] || 0, d = R[di] || 0;
  const delta = d - a;
  const sign  = delta >= 0 ? "+" : "";
  log(`  │ ${label.padEnd(31)} │ ${a.toLocaleString().padStart(14)} │ ${d.toLocaleString().padStart(14)} │ ${(sign + delta.toLocaleString()).padStart(8)} │`);
}
log("  └─────────────────────────────────┴────────────────┴────────────────┴──────────┘");
log("  (positive Delta = Diamond costs more gas)");

const outPath = path.join(__dirname, "..", "gas_results.json");
fs.writeFileSync(outPath, JSON.stringify(R, null, 2));
log(`\n  Saved → ${outPath}`);
