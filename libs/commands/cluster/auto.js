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
const { sendTx } = require('../txExecutor');
const { acquireLock } = require('../clusterLock');
const { scanAllConflicts, scanIdConflicts, failOnAllConflicts } = require('../contractConflicts');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;
const deployContract = chainDeploy.deployContract;

const CLUSTER_ABI = [
    'function addActivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addPassivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addActivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addPassivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function registerContract(uint32 id, string memory name, address contractAddr) external',
    'function getById(uint32 id) view returns (tuple(uint32 contractId, string name, address contractAddr))',
];

const NORMAL_TEMPLATE_QUERY_ABI = [
    'function getActiveModuleAddress(uint32 _contractId) view returns (address)',
    'function getPassiveModuleAddress(uint32 _contractId) view returns (address)',
];

const NORMAL_TEMPLATE_ALL_ABI = [
    'function getAllActiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])',
    'function getAllPassiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])',
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

async function alignPlanWithChainState(plan, clusterRead, provider) {
    const warnings = [];

    for (const item of plan) {
        if (item.state !== 'mounted' && item.state !== 'unmounted') continue;

        let chainAddr = null;
        try {
            const entry = await clusterRead.getById(item.fscaId);
            chainAddr = entry?.contractAddr || null;
        } catch {
            chainAddr = null;
        }

        if (chainAddr && chainAddr !== ethers.ZeroAddress) {
            if (!item.existingAddress || chainAddr.toLowerCase() !== item.existingAddress.toLowerCase()) {
                warnings.push(
                    `Contract "${item.contractName}" (id=${item.fscaId}) project.json address differs from on-chain registry; using on-chain address ${chainAddr}.`
                );
                item.existingAddress = chainAddr;
            }
            item.state = 'mounted';
            item.actions = [];
            continue;
        }

        const existingCode = item.existingAddress ? await provider.getCode(item.existingAddress) : '0x';
        if (existingCode && existingCode !== '0x') {
            if (item.state === 'mounted') {
                warnings.push(
                    `Contract "${item.contractName}" (id=${item.fscaId}) is marked mounted in project.json but missing from on-chain registry; downgrading to unmounted.`
                );
            }
            item.state = 'unmounted';
            item.actions = ['link', 'mount'];
            continue;
        }

        warnings.push(
            `Contract "${item.contractName}" (id=${item.fscaId}) has no on-chain code at project.json address; downgrading to undeployed.`
        );
        item.state = 'undeployed';
        item.existingAddress = null;
        item.actions = ['deploy', 'link', 'mount'];
    }

    return warnings;
}

async function podLinkExists(provider, sourceAddr, type, targetId, targetAddr) {
    const source = new ethers.Contract(sourceAddr, NORMAL_TEMPLATE_QUERY_ABI, provider);
    const linkedAddr = type === 'active'
        ? await source.getActiveModuleAddress(targetId)
        : await source.getPassiveModuleAddress(targetId);
    return !!linkedAddr &&
        linkedAddr !== ethers.ZeroAddress &&
        linkedAddr.toLowerCase() === targetAddr.toLowerCase();
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

        // 3b. Conflict check
        const conflicts = scanAllConflicts(rootDir);
        const { idConflicts } = scanIdConflicts(rootDir);
        failOnAllConflicts({ ...conflicts, idConflicts });

        // Connect
        const provider = getProvider(config.network.rpc);
        const signer = getSigner(config.account.privateKey, provider);
        const clusterAddr = config.fsca.clusterAddress;
        const clusterRead = new ethers.Contract(clusterAddr, CLUSTER_ABI, provider);
        const cluster = new ethers.Contract(clusterAddr, CLUSTER_ABI, signer);

        const chainStateWarnings = await alignPlanWithChainState(plan, clusterRead, provider);
        for (const w of chainStateWarnings) {
            console.warn(`  ⚠  ${w}`);
            report.warnings.push(w);
        }

        // Checkpoint helpers
        const cpPath = path.join(rootDir, 'auto-checkpoint.json');
        function writeCheckpoint(completedSteps, state) {
            fs.writeFileSync(cpPath, JSON.stringify({
                command: 'cluster-auto',
                version: 1,
                clusterAddress: clusterAddr,
                startedAt: cpStartedAt,
                completedSteps: [...completedSteps],
                state,
            }, null, 2), 'utf-8');
        }
        function deleteCheckpoint() {
            if (fs.existsSync(cpPath)) fs.unlinkSync(cpPath);
        }

        // Resume / restart logic
        let checkpoint = null;
        if (fs.existsSync(cpPath)) {
            try { checkpoint = JSON.parse(fs.readFileSync(cpPath, 'utf-8')); } catch { checkpoint = null; }
            if (checkpoint && checkpoint.clusterAddress !== clusterAddr) checkpoint = null;
        }
        if (checkpoint && args.restart) {
            deleteCheckpoint(); checkpoint = null;
            console.log('  Restarting from scratch (--restart).');
        } else if (checkpoint && !args.resume) {
            const resume = await confirm('Found auto-checkpoint.json. Resume from last checkpoint?', false);
            if (!resume) { deleteCheckpoint(); checkpoint = null; }
        }
        if (checkpoint) console.log(`  Resuming auto-assembly (${checkpoint.completedSteps.length} steps already done).`);

        const completedSteps = new Set(checkpoint ? checkpoint.completedSteps : []);
        const cpStartedAt = (checkpoint && checkpoint.startedAt) || new Date().toISOString();

        // Track all addresses: fscaId → address (restore from checkpoint if resuming)
        const deployedAddrs = new Map();
        if (checkpoint && checkpoint.state && checkpoint.state.deployedAddrs) {
            for (const [k, v] of Object.entries(checkpoint.state.deployedAddrs)) {
                deployedAddrs.set(Number(k), v);
            }
        }
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

        const lock = acquireLock(rootDir, clusterAddr, 'cluster auto');
        try {

            // 4. Deploy all contracts first
            console.log('[4/6] Deploying contracts...');
            for (const item of plan) {
                if (!item.actions.includes('deploy')) continue;

                const stepKey = `deploy:${item.contractName}`;
                if (completedSteps.has(stepKey)) {
                    const addr = deployedAddrs.get(item.fscaId);
                    console.log(`  ↩ skip ${stepKey}: ${addr}`);
                    item.existingAddress = addr;
                    continue;
                }

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
                item.existingAddress = contractAddr;

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
                completedSteps.add(stepKey);
                writeCheckpoint(completedSteps, { deployedAddrs: Object.fromEntries(deployedAddrs) });
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
            // If target is also being freshly deployed (not yet mounted/registered on-chain),
            // defer to afterMount to avoid "target id and addr dismatch" revert.
            console.log('[5/6] Linking contracts...');
            const idToState = new Map(plan.map(i => [i.fscaId, i.state]));
            const deferredLinks = []; // { type, from: item, depId } — will be linked afterMount
            for (const item of plan) {
                if (!item.actions.includes('link')) continue;
                const contractAddr = deployedAddrs.get(item.fscaId);
                if (!contractAddr) { console.warn(`  ⚠  No address for id=${item.fscaId}, skipping link`); continue; }

                for (const depId of item.activePods) {
                    const edgeKey = `link:active:${depId}->${item.fscaId}`;
                    if (podCycleEdgeSet.has(`${depId}->${item.fscaId}`)) continue;
                    if (funcCycleEdgeSet.has(`${depId}->${item.fscaId}`)) {
                        console.log(`    Skipped active  id=${depId} → id=${item.fscaId} (function cycle)`);
                        report.skippedLinks.push({ type: 'active', from: depId, to: item.fscaId, reason: 'func-cycle' });
                        continue;
                    }
                    const targetAddr = deployedAddrs.get(depId);
                    if (!targetAddr) { console.warn(`    ⚠  active dep id=${depId} not found, skipping`); continue; }
                    if (completedSteps.has(edgeKey)) { console.log(`  ↩ skip ${edgeKey}`); continue; }
                    // Defer if target is freshly deployed (not yet registered on-chain)
                    if (idToState.get(depId) === 'undeployed' || idToState.get(depId) === 'unmounted') {
                        deferredLinks.push({ type: 'active', item, depId, contractAddr, targetAddr, edgeKey });
                        continue;
                    }
                    await sendTx(() => cluster.addActivePodBeforeMount(contractAddr, targetAddr, depId), { label: edgeKey });
                    console.log(`    Linked active  id=${depId} → id=${item.fscaId}`);
                    completedSteps.add(edgeKey);
                    writeCheckpoint(completedSteps, { deployedAddrs: Object.fromEntries(deployedAddrs) });
                }
                for (const depId of item.passivePods) {
                    const edgeKey = `link:passive:${depId}->${item.fscaId}`;
                    if (podCycleEdgeSet.has(`${depId}->${item.fscaId}`)) continue;
                    if (funcCycleEdgeSet.has(`${depId}->${item.fscaId}`)) {
                        console.log(`    Skipped passive id=${depId} → id=${item.fscaId} (function cycle)`);
                        report.skippedLinks.push({ type: 'passive', from: depId, to: item.fscaId, reason: 'func-cycle' });
                        continue;
                    }
                    const targetAddr = deployedAddrs.get(depId);
                    if (!targetAddr) { console.warn(`    ⚠  passive dep id=${depId} not found, skipping`); continue; }
                    if (completedSteps.has(edgeKey)) { console.log(`  ↩ skip ${edgeKey}`); continue; }
                    // Defer if target is freshly deployed (not yet registered on-chain)
                    if (idToState.get(depId) === 'undeployed' || idToState.get(depId) === 'unmounted') {
                        deferredLinks.push({ type: 'passive', item, depId, contractAddr, targetAddr, edgeKey });
                        continue;
                    }
                    await sendTx(() => cluster.addPassivePodBeforeMount(contractAddr, targetAddr, depId), { label: edgeKey });
                    console.log(`    Linked passive id=${depId} → id=${item.fscaId}`);
                    completedSteps.add(edgeKey);
                    writeCheckpoint(completedSteps, { deployedAddrs: Object.fromEntries(deployedAddrs) });
                }
            }

            // 6. Mount all contracts, then afterMount pod-cycle edges (excluding func-cycle edges)
            console.log('[6/6] Mounting contracts...');
            for (const item of plan) {
                if (!item.actions.includes('mount')) continue;
                const contractAddr = deployedAddrs.get(item.fscaId);
                if (!contractAddr) { console.warn(`  ⚠  No address for id=${item.fscaId}, skipping mount`); continue; }

                const mountKey = `mount:${item.fscaId}`;
                if (!completedSteps.has(mountKey)) {
                    await sendTx(() => cluster.registerContract(item.fscaId, item.contractName, contractAddr), { label: mountKey });
                    completedSteps.add(mountKey);
                    writeCheckpoint(completedSteps, { deployedAddrs: Object.fromEntries(deployedAddrs) });
                } else {
                    console.log(`  ↩ skip ${mountKey}`);
                }
                console.log(`  → Mounted [id=${item.fscaId}] ${item.contractName} at ${contractAddr}`);

                const timestamp = Math.floor(Date.now() / 1000);
                if (!config.fsca.runningcontracts) config.fsca.runningcontracts = [];
                config.fsca.unmountedcontracts = (config.fsca.unmountedcontracts || []).filter(
                    c => c.address.toLowerCase() !== contractAddr.toLowerCase()
                );
                const runEntry = { name: item.contractName, address: contractAddr, contractId: item.fscaId, timeStamp: timestamp };
                const existIdx = config.fsca.runningcontracts.findIndex(c => c.contractId != null && Number(c.contractId) === item.fscaId);
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

            // AfterMount: deferred links (targets were freshly deployed, now registered)
            if (deferredLinks.length > 0) {
                console.log(`\n  Linking deferred pod edges (afterMount, ${deferredLinks.length} edge(s))...`);
                for (const { type, item, depId, contractAddr, targetAddr, edgeKey } of deferredLinks) {
                    if (completedSteps.has(edgeKey)) { console.log(`  ↩ skip ${edgeKey}`); continue; }
                    if (await podLinkExists(provider, contractAddr, type, depId, targetAddr)) {
                        console.log(`  ↩ skip ${edgeKey} (already linked on-chain)`);
                        completedSteps.add(edgeKey);
                        continue;
                    }
                    if (type === 'active') {
                        await sendTx(() => cluster.addActivePodAfterMount(contractAddr, targetAddr, depId), { label: edgeKey });
                        console.log(`    Linked active  id=${depId} → id=${item.fscaId} (deferred)`);
                    } else {
                        await sendTx(() => cluster.addPassivePodAfterMount(contractAddr, targetAddr, depId), { label: edgeKey });
                        console.log(`    Linked passive id=${depId} → id=${item.fscaId} (deferred)`);
                    }
                    completedSteps.add(edgeKey);
                    writeCheckpoint(completedSteps, { deployedAddrs: Object.fromEntries(deployedAddrs) });
                }
            }

            // AfterMount: pod-level cycle edges only (skip func-cycle edges)
            const afterMountEdges = cycleEdges.filter(e => !funcCycleEdgeSet.has(`${e.from}->${e.to}`));
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
                    const amKey = `afterMount:${edge.type}:${edge.from}->${edge.to}`;
                    const linkKey = `link:${edge.type}:${edge.from}->${edge.to}`;
                    if (completedSteps.has(amKey) || completedSteps.has(linkKey)) { console.log(`  ↩ skip ${amKey}`); continue; }
                    if (await podLinkExists(provider, toAddr, edge.type, edge.from, fromAddr)) {
                        console.log(`  ↩ skip ${amKey} (already linked on-chain)`);
                        completedSteps.add(amKey);
                        continue;
                    }
                    if (edge.type === 'active') {
                        await sendTx(() => cluster.addActivePodAfterMount(toAddr, fromAddr, edge.from), { label: amKey });
                    } else {
                        await sendTx(() => cluster.addPassivePodAfterMount(toAddr, fromAddr, edge.from), { label: amKey });
                    }
                    console.log(`    Cycle link [${edge.type}] id=${edge.from} → id=${edge.to}`);
                    completedSteps.add(amKey);
                    writeCheckpoint(completedSteps, { deployedAddrs: Object.fromEntries(deployedAddrs) });
                }
            }

            // Snapshot sync: read live pod state from chain for all newly mounted contracts
            if (report.assembled.length > 0) {
                console.log('\n  Syncing pod snapshots from chain...');
                const snapshotErrors = [];
                for (const { contractName, fscaId, address: contractAddr } of report.assembled) {
                    try {
                        const contract = new ethers.Contract(contractAddr, NORMAL_TEMPLATE_ALL_ABI, provider);
                        const [activeModules, passiveModules] = await Promise.all([
                            contract.getAllActiveModules(),
                            contract.getAllPassiveModules(),
                        ]);
                        const podSnapshot = {
                            active: activeModules.map(m => ({ contractId: Number(m.contractId) })),
                            passive: passiveModules.map(m => ({ contractId: Number(m.contractId) })),
                        };
                        config.fsca.alldeployedcontracts = config.fsca.alldeployedcontracts.map(r =>
                            r.address && r.address.toLowerCase() === contractAddr.toLowerCase()
                                ? { ...r, podSnapshot }
                                : r
                        );
                        console.log(`    [id=${fscaId}] ${contractName}: active=[${podSnapshot.active.map(p => p.contractId).join(',')}] passive=[${podSnapshot.passive.map(p => p.contractId).join(',')}]`);
                    } catch (e) {
                        const msg = `podSnapshot sync failed for ${contractName} (id=${fscaId}): ${e.message}`;
                        console.error(`    ✗  ${msg}`);
                        snapshotErrors.push(msg);
                        report.errors.push(msg);
                    }
                }
                saveProjectConfig(rootDir, config);
                if (snapshotErrors.length > 0) {
                    const reportPath = path.join(rootDir, 'auto-report.json');
                    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
                    console.error(`\n✗ Pod snapshot sync failed for ${snapshotErrors.length} contract(s). Assembly is complete on-chain but project.json snapshots are incomplete — rollback may not restore pod topology. See auto-report.json.`);
                    process.exit(1);
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

            deleteCheckpoint();
            console.log(`\n✓ Auto assembly complete: ${report.assembled.length} mounted, ${report.skipped.length} skipped, ${report.skippedLinks.length} link(s) skipped (func-cycle).`);

        } finally {
            lock.release();
        }

    } catch (error) {
        console.error('\nAuto assembly failed:', error.message);
        if (process.env.DEBUG) console.error(error.stack);
        process.exit(1);
    }
};
