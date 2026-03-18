/**
 * fsca cluster auto
 * 声明式配置与自动装配：
 *   pre-flight check → reconcile → compile → deploy all → link all → mount all
 *
 * 执行顺序改进：所有合约先全部 deploy（确保都有 CA），再统一 link，再统一 mount。
 * 函数环对应的 pod 边既不 beforeMount link 也不 afterMount 补边。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');

const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');
const chainDeploy = require('../../../chain/deploy');

const analyze = require('./auto/analyze');
const reconcile = require('./auto/reconciler');
const { loadProjectConfig, saveProjectConfig, loadArtifact } = require('./auto/utils');
const { resolveCleanupMode, performCleanup, findSourceFile, findArtifactFile } = require('../cleanup');
const { confirm } = require('../confirm');
const { nextDeploySeq, nextGeneration } = require('../version');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;
const deployContract = chainDeploy.deployContract;

const CLUSTER_ABI = [
    'function addActivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addPassivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addActivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addPassivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function registerContract(uint32 id, string memory name, address contractAddr) external',
];

function printPlan(planItems, cycleEdges, idToName, funcCycles, funcCycleEdgeSet) {
    console.log('\n=== Auto Assembly Plan ===\n');
    for (const item of planItems) {
        const acts = item.actions.length ? item.actions.join(' → ') : '(skip, already mounted)';
        console.log(`  [id=${item.fscaId}] ${item.contractName}`);
        console.log(`    state:   ${item.state}`);
        console.log(`    actions: ${acts}`);
        if (item.activePods.length) {
            const pods = item.activePods.map(id => {
                const skipped = funcCycleEdgeSet.has(`${id}->${item.fscaId}`);
                return skipped ? `${id}(skipped-func-cycle)` : `${id}`;
            });
            console.log(`    active:  [${pods.join(', ')}]`);
        }
        if (item.passivePods.length) {
            const pods = item.passivePods.map(id => {
                const skipped = funcCycleEdgeSet.has(`${id}->${item.fscaId}`);
                return skipped ? `${id}(skipped-func-cycle)` : `${id}`;
            });
            console.log(`    passive: [${pods.join(', ')}]`);
        }
    }
    if (cycleEdges.length > 0) {
        console.log('\n  Pod-level cycle edges (afterMount):');
        for (const e of cycleEdges) {
            const fromName = idToName.get(e.from) || e.from;
            const toName = idToName.get(e.to) || e.to;
            const skipped = funcCycleEdgeSet.has(`${e.from}->${e.to}`);
            console.log(`    ${fromName}(${e.from}) --[${e.type}]--> ${toName}(${e.to})${skipped ? ' (skipped-func-cycle)' : ''}`);
        }
    }
    if (funcCycles.length > 0) {
        console.log('\n  Function-level call cycles (pod links skipped):');
        for (const cycle of funcCycles) {
            console.log(`    ${cycle.join(' → ')}`);
        }
    }
    console.log('');
}

module.exports = async function auto({ rootDir, args = {} }) {
    const dryRun = !!args['dry-run'];
    const report = { assembled: [], skipped: [], warnings: [], podCycles: [], funcCycles: [], skippedLinks: [], errors: [] };

    try {
        // Pre-flight: static analysis (scan, parse, ID conflict, pod cycles, func cycles)
        console.log('[1/6] Running pre-flight checks...');
        const {
            parsed, idToName, idToContract,
            sorted, cycleEdges,
            podCycles, funcCycles, funcCycleEdgeSet,
            warnings, errors,
        } = analyze(rootDir);

        report.warnings = warnings;
        report.errors = errors;
        report.podCycles = podCycles;
        report.funcCycles = funcCycles;

        if (errors.length > 0) {
            console.error(`\n✗ Pre-flight failed: ${errors.length} annotation error(s). Fix them before running auto.`);
            process.exit(1);
        }

        if (parsed.length === 0) {
            console.log('      No contracts with @fsca-auto yes found. Nothing to do.');
            return;
        }
        console.log(`      ${parsed.length} contract(s) found.`);
        console.log(`      Topo order: [${sorted.map(id => `${idToName.get(id)}(${id})`).join(' → ')}]`);
        if (funcCycles.length > 0) {
            console.log(`      ✗ ${funcCycles.length} function-level cycle(s) — affected pod links will be skipped.`);
        }

        const orderedContracts = sorted.map(id => idToContract.get(id)).filter(Boolean);

        // 2. Reconcile with project.json
        console.log('[2/6] Reconciling with project.json...');
        const config = loadProjectConfig(rootDir);
        const { plan, warnings: reconcileWarnings } = reconcile(orderedContracts, config);
        for (const w of reconcileWarnings) {
            console.warn(`  ⚠  ${w}`);
            report.warnings.push(w);
        }

        // Dry-run: print plan and exit
        if (dryRun) {
            printPlan(plan, cycleEdges, idToName, funcCycles, funcCycleEdgeSet);
            console.log('Dry-run mode: no on-chain operations performed.');
            return;
        }

        const ok = await confirm(`Proceed with auto-assembly? (${plan.filter(i => i.actions.length).length} contract(s) to process)`, !!args.yes);
        if (!ok) {
            console.log('Aborted.');
            return;
        }

        // 3. Compile
        console.log('[3/6] Compiling contracts...');
        try {
            execSync('npx hardhat compile', { cwd: rootDir, stdio: 'inherit' });
        } catch (e) {
            throw new Error('Compilation failed');
        }

        // Connect
        const provider = getProvider(config.network.rpc);
        const rawSigner = getSigner(config.account.privateKey, provider);
        const signer = new ethers.NonceManager(rawSigner);
        const clusterAddr = config.fsca.clusterAddress;
        const cluster = new ethers.Contract(clusterAddr, CLUSTER_ABI, signer);

        // Track all addresses: fscaId → address
        const deployedAddrs = new Map();
        for (const item of plan) {
            if (item.state === 'mounted' && item.existingAddress) {
                deployedAddrs.set(item.fscaId, item.existingAddress);
            }
            if (item.state === 'unmounted' && item.existingAddress) {
                deployedAddrs.set(item.fscaId, item.existingAddress);
            }
        }

        // Pod-level cycle edge set (for afterMount)
        const podCycleEdgeSet = new Set(cycleEdges.map(e => `${e.from}->${e.to}`));

        // 4. Deploy all contracts first
        console.log('[4/6] Deploying contracts...');
        for (const item of plan) {
            if (!item.actions.includes('deploy')) continue;

            console.log(`  → [id=${item.fscaId}] ${item.contractName}`);
            const artifact = loadArtifact(rootDir, item.contractName);
            const inputs = artifact?.abi?.find(x => x.type === 'constructor')?.inputs || [];
            if (inputs.length > 2) {
                throw new Error(`Contract "${item.contractName}" constructor has ${inputs.length} parameters — auto only supports 0, 1 (clusterAddr), or 2 (clusterAddr, name). Deploy it manually.`);
            }
            const ctorArgs = inputs.length === 0 ? [] : inputs.length === 1 ? [clusterAddr] : [clusterAddr, item.contractName];
            const contractAddr = await deployContract(signer, artifact.abi, artifact.bytecode, ctorArgs);
            console.log(`    Deployed: ${contractAddr}`);

            deployedAddrs.set(item.fscaId, contractAddr);
            item.existingAddress = contractAddr; // update plan in-place for link/mount phases

            const timestamp = Math.floor(Date.now() / 1000);
            if (!config.fsca.alldeployedcontracts) config.fsca.alldeployedcontracts = [];
            if (!config.fsca.unmountedcontracts) config.fsca.unmountedcontracts = [];
            const deploySeq = nextDeploySeq(config.fsca.alldeployedcontracts);
            const entry = {
                name: item.contractName,
                address: contractAddr,
                contractId: null,
                generation: null,
                deploySeq,
                status: 'deployed',
                timeStamp: timestamp,
                deployTx: null,
                podSnapshot: { active: [], passive: [] },
            };
            config.fsca.alldeployedcontracts.push(entry);
            config.fsca.unmountedcontracts.push(entry);
            saveProjectConfig(rootDir, config);
        }

        // 4b. Cleanup deployed source/artifacts
        const cleanupMode = resolveCleanupMode(args, config);
        if (cleanupMode !== 'keep') {
            const deployedItems = plan.filter(item => item.actions.includes('deploy'));
            const cleanupFiles = deployedItems.map(item => {
                const contract = idToContract.get(item.fscaId);
                return {
                    contractName: item.contractName,
                    sourcePath: contract ? contract.filePath : findSourceFile(rootDir, item.contractName),
                    artifactPath: findArtifactFile(rootDir, item.contractName),
                };
            });
            if (cleanupFiles.length > 0) {
                const cleanupResult = performCleanup({ mode: cleanupMode, files: cleanupFiles, rootDir });
                report.cleanup = { mode: cleanupMode, actions: cleanupResult.actions, errors: cleanupResult.errors };
                for (const action of cleanupResult.actions) {
                    if (action.status === 'ok') console.log(`  Cleanup [${cleanupMode}]: ${action.contractName} ${action.fileType} ${action.action}`);
                    else if (action.status === 'skipped') console.log(`  Cleanup: ${action.contractName} ${action.fileType} skipped`);
                    else console.warn(`  ⚠  Cleanup error (${action.contractName} ${action.fileType}): ${action.error}`);
                }
            }
        }

        // 5. Link all contracts (beforeMount), skipping pod-cycle edges and func-cycle edges
        console.log('[5/6] Linking contracts...');
        for (const item of plan) {
            if (!item.actions.includes('link')) continue;
            const contractAddr = deployedAddrs.get(item.fscaId);
            if (!contractAddr) { console.warn(`  ⚠  No address for id=${item.fscaId}, skipping link`); continue; }

            for (const depId of item.activePods) {
                const edgeKey = `${depId}->${item.fscaId}`;
                if (podCycleEdgeSet.has(edgeKey)) continue; // handled afterMount
                if (funcCycleEdgeSet.has(edgeKey)) {
                    console.log(`    Skipped active  id=${depId} → id=${item.fscaId} (function cycle)`);
                    report.skippedLinks.push({ type: 'active', from: depId, to: item.fscaId, reason: 'func-cycle' });
                    continue;
                }
                const targetAddr = deployedAddrs.get(depId);
                if (!targetAddr) { console.warn(`    ⚠  active dep id=${depId} not found, skipping`); continue; }
                await (await cluster.addActivePodBeforeMount(contractAddr, targetAddr, depId)).wait();
                console.log(`    Linked active  id=${depId} → id=${item.fscaId}`);
            }
            for (const depId of item.passivePods) {
                const edgeKey = `${depId}->${item.fscaId}`;
                if (podCycleEdgeSet.has(edgeKey)) continue;
                if (funcCycleEdgeSet.has(edgeKey)) {
                    console.log(`    Skipped passive id=${depId} → id=${item.fscaId} (function cycle)`);
                    report.skippedLinks.push({ type: 'passive', from: depId, to: item.fscaId, reason: 'func-cycle' });
                    continue;
                }
                const targetAddr = deployedAddrs.get(depId);
                if (!targetAddr) { console.warn(`    ⚠  passive dep id=${depId} not found, skipping`); continue; }
                await (await cluster.addPassivePodBeforeMount(contractAddr, targetAddr, depId)).wait();
                console.log(`    Linked passive id=${depId} → id=${item.fscaId}`);
            }
        }

        // 6. Mount all contracts, then afterMount pod-cycle edges (excluding func-cycle edges)
        console.log('[6/6] Mounting contracts...');
        for (const item of plan) {
            if (!item.actions.includes('mount')) continue;
            const contractAddr = deployedAddrs.get(item.fscaId);
            if (!contractAddr) { console.warn(`  ⚠  No address for id=${item.fscaId}, skipping mount`); continue; }

            await (await cluster.registerContract(item.fscaId, item.contractName, contractAddr)).wait();
            console.log(`  → Mounted [id=${item.fscaId}] ${item.contractName} at ${contractAddr}`);

            const timestamp = Math.floor(Date.now() / 1000);
            if (!config.fsca.runningcontracts) config.fsca.runningcontracts = [];
            config.fsca.unmountedcontracts = (config.fsca.unmountedcontracts || []).filter(
                c => c.address.toLowerCase() !== contractAddr.toLowerCase()
            );
            const runEntry = { name: item.contractName, address: contractAddr, contractId: item.fscaId, timeStamp: timestamp };
            const existIdx = config.fsca.runningcontracts.findIndex(c => Number(c.contractId) === item.fscaId);
            if (existIdx >= 0) config.fsca.runningcontracts[existIdx] = runEntry;
            else config.fsca.runningcontracts.push(runEntry);
            const newGen = nextGeneration(config.fsca.alldeployedcontracts, item.fscaId);
            config.fsca.alldeployedcontracts = (config.fsca.alldeployedcontracts || []).map(c =>
                c.address.toLowerCase() === contractAddr.toLowerCase()
                    ? { ...c, contractId: item.fscaId, generation: newGen, status: 'mounted' }
                    : c
            );
            config.fsca.currentOperating = contractAddr;
            saveProjectConfig(rootDir, config);

            report.assembled.push({ contractName: item.contractName, fscaId: item.fscaId, address: contractAddr });
        }

        // AfterMount: pod-level cycle edges only (skip func-cycle edges)
        const afterMountEdges = cycleEdges.filter(e => !funcCycleEdgeSet.has(`${e.from}->${e.to}`));
        // Count func-cycle edges that were filtered out of afterMount
        for (const edge of cycleEdges) {
            if (funcCycleEdgeSet.has(`${edge.from}->${edge.to}`)) {
                report.skippedLinks.push({ type: edge.type, from: edge.from, to: edge.to, reason: 'func-cycle' });
            }
        }
        if (afterMountEdges.length > 0) {
            console.log('\n  Linking pod cycle edges (afterMount)...');
            for (const edge of afterMountEdges) {
                const fromAddr = deployedAddrs.get(edge.from);
                const toAddr = deployedAddrs.get(edge.to);
                if (!fromAddr || !toAddr) {
                    console.warn(`  ⚠  Cannot link cycle edge ${edge.from}->${edge.to}: address not found`);
                    continue;
                }
                if (edge.type === 'active') {
                    await (await cluster.addActivePodAfterMount(toAddr, fromAddr, edge.from)).wait();
                } else {
                    await (await cluster.addPassivePodAfterMount(toAddr, fromAddr, edge.from)).wait();
                }
                console.log(`    Cycle link [${edge.type}] id=${edge.from} → id=${edge.to}`);
            }
        }

        // Skipped items
        for (const item of plan) {
            if (item.actions.length === 0) {
                report.skipped.push({ contractName: item.contractName, fscaId: item.fscaId, reason: 'already mounted' });
            }
        }

        // Write report
        if (report.podCycles.length > 0 || report.funcCycles.length > 0 || report.warnings.length > 0 || report.errors.length > 0 || report.skippedLinks.length > 0) {
            const reportPath = path.join(rootDir, 'auto-report.json');
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
            console.log(`\n  Report written to auto-report.json`);
        }

        console.log(`\n✓ Auto assembly complete: ${report.assembled.length} mounted, ${report.skipped.length} skipped, ${report.skippedLinks.length} link(s) skipped (func-cycle).`);

    } catch (error) {
        console.error('\nAuto assembly failed:', error.message);
        if (process.env.DEBUG) console.error(error.stack);
        process.exit(1);
    }
};
