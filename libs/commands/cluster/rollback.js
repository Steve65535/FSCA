/**
 * fsca cluster rollback --id <contractId> [--generation <n>] [--dry-run] [--yes]
 *
 * Restores a deprecated contract version by:
 * 1. Validating target record (status=deprecated, bytecode exists on-chain)
 * 2. Saving current contract's podSnapshot
 * 3. deleteContract(id) → registerContract(id, name, oldAddr)
 * 4. Restoring pod edges from podSnapshot (contractId-only, resolved via registry)
 * 5. Updating project.json status fields
 *
 * Checkpoint file: rollback-checkpoint.json (deleted on success)
 * Report file: rollback-report.json (written on completion)
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');
const credentials = require('../../../wallet/credentials');
const { confirm } = require('../confirm');
const { normalizeRecord, findMounted, findGeneration, findPreviousGeneration } = require('../version');
const { sendTx } = require('../txExecutor');
const { acquireLock } = require('../clusterLock');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;

const CLUSTER_ABI = [
    'function getById(uint32 id) view returns (tuple(uint32 contractId, string name, address contractAddr))',
    'function deleteContract(uint32 id) external',
    'function registerContract(uint32 id, string memory name, address contractAddr) external',
    'function addActivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addPassivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external',
];

const TEMPLATE_ABI = [
    'function getAllActiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])',
    'function getAllPassiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])',
];

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) throw new Error('project.json not found. Run "fsca init" first.');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const rpcUrl = credentials.resolveRpcUrl(config, rootDir);
    const privateKey = credentials.resolvePrivateKey(config, rootDir);
    if (!rpcUrl) throw new Error('RPC URL not configured');
    if (!privateKey) throw new Error('Private key not configured');
    config.network = config.network || {};
    config.account = config.account || {};
    config.network.rpc = rpcUrl;
    config.account.privateKey = privateKey;
    if (!config.fsca?.clusterAddress) throw new Error('fsca.clusterAddress not configured. Run "fsca cluster init" first.');
    return config;
}

function saveProjectConfig(rootDir, config) {
    fs.writeFileSync(path.join(rootDir, 'project.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function writeCheckpoint(rootDir, data) {
    fs.writeFileSync(path.join(rootDir, 'rollback-checkpoint.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function deleteCheckpoint(rootDir) {
    const p = path.join(rootDir, 'rollback-checkpoint.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

function writeReport(rootDir, report) {
    fs.writeFileSync(path.join(rootDir, 'rollback-report.json'), JSON.stringify(report, null, 2), 'utf-8');
}

module.exports = async function rollback({ rootDir, args = {} }) {
    try {
        const { id, generation: genArg, 'dry-run': dryRun } = args;
        if (!id) throw new Error('--id required: contract ID to roll back');

        const contractId = Number(id);
        const config = loadProjectConfig(rootDir);
        const allDeployed = config.fsca.alldeployedcontracts || [];

        // 1. Find target record
        let targetRecord;
        if (genArg != null) {
            targetRecord = findGeneration(allDeployed, contractId, Number(genArg));
            if (!targetRecord) throw new Error(`No record found for contractId=${contractId} generation=${genArg}`);
        } else {
            targetRecord = findPreviousGeneration(allDeployed, contractId);
            if (!targetRecord) throw new Error(`No previous generation found for contractId=${contractId}. Use --generation to specify explicitly.`);
        }

        const normalized = normalizeRecord(targetRecord, 'alldeployedcontracts');
        if (normalized.status !== 'deprecated') {
            throw new Error(`Target record (generation=${normalized.generation}) has status="${normalized.status}". Only deprecated records can be rolled back.`);
        }

        const targetAddr = targetRecord.address;
        const registeredName = targetRecord.name;

        // 2. Find current mounted record
        const currentRecord = findMounted(allDeployed, contractId);
        if (!currentRecord) throw new Error(`No mounted contract found for contractId=${contractId}`);
        const currentAddr = currentRecord.address;

        // 3. Validate target bytecode exists on-chain
        const provider = getProvider(config.network.rpc);
        const code = await provider.getCode(targetAddr);
        if (!code || code === '0x') {
            throw new Error(`Target contract ${targetAddr} has no bytecode on-chain. Cannot roll back to a destroyed contract.`);
        }

        // Print plan
        console.log(`\nRollback plan for contractId=${contractId} (${registeredName}):`);
        console.log(`  Current (will be deprecated): gen=${currentRecord.generation}  ${currentAddr}`);
        console.log(`  Target  (will be mounted):    gen=${normalized.generation}  ${targetAddr}`);
        if (normalized.podSnapshot?.active?.length || normalized.podSnapshot?.passive?.length) {
            console.log(`  Pod snapshot: active=[${(normalized.podSnapshot.active || []).map(p => p.contractId).join(',')}] passive=[${(normalized.podSnapshot.passive || []).map(p => p.contractId).join(',')}]`);
        } else {
            console.log(`  Pod snapshot: empty (no pods will be restored)`);
        }

        if (dryRun) {
            console.log('\nDry-run mode: no on-chain operations performed.');
            return;
        }

        const ok = await confirm(`Proceed with rollback? contractId=${contractId} → generation=${normalized.generation}`, !!args.yes);
        if (!ok) { console.log('Aborted.'); return; }

        // 4. Read current contract's pod config for its snapshot (before unmounting)
        const rawSigner = getSigner(config.account.privateKey, provider);
        const signer = new ethers.NonceManager(rawSigner);
        const clusterAddr = config.fsca.clusterAddress;
        const clusterWrite = new ethers.Contract(clusterAddr, CLUSTER_ABI, signer);

        const lock = acquireLock(rootDir, clusterAddr, 'cluster rollback');
        try {

        let currentActivePods = [];
        let currentPassivePods = [];
        try {
            const currentContract = new ethers.Contract(currentAddr, TEMPLATE_ABI, provider);
            const activeModules = await currentContract.getAllActiveModules();
            const passiveModules = await currentContract.getAllPassiveModules();
            currentActivePods = activeModules.map(m => ({ contractId: Number(m.contractId) }));
            currentPassivePods = passiveModules.map(m => ({ contractId: Number(m.contractId) }));
        } catch (e) {
            console.warn(`  ⚠  Could not read current pod config: ${e.message}`);
        }

        const report = {
            timestamp: new Date().toISOString(),
            contractId,
            fromGeneration: currentRecord.generation,
            toGeneration: normalized.generation,
            fromAddress: currentAddr,
            toAddress: targetAddr,
            podRestoreResults: [],
            errors: [],
        };

        // Step A: deleteContract
        writeCheckpoint(rootDir, { step: 'A', contractId, targetAddr, currentAddr });
        console.log(`\n[1/3] Unmounting current contract #${contractId}...`);
        await sendTx(() => clusterWrite.deleteContract(contractId), { label: `deleteContract #${contractId}` });
        console.log(`      Unmounted: ${currentAddr}`);

        // Step B: registerContract
        writeCheckpoint(rootDir, { step: 'B', contractId, targetAddr, currentAddr });
        console.log(`[2/3] Mounting target contract...`);
        try {
            await sendTx(() => clusterWrite.registerContract(contractId, registeredName, targetAddr), { label: `registerContract #${contractId}` });
            console.log(`      Mounted: ${targetAddr}`);
        } catch (e) {
            report.errors.push(`Step B failed: ${e.message}`);
            writeReport(rootDir, report);
            console.error(`\n✗ Step B failed: ${e.message}`);
            console.error(`  Recovery: fsca cluster mount ${contractId} ${registeredName} (after choosing ${targetAddr})`);
            process.exit(1);
        }

        // Step C: restore pod edges from podSnapshot (resolve addresses from registry)
        writeCheckpoint(rootDir, { step: 'C', contractId, targetAddr, currentAddr });
        console.log(`[3/3] Restoring pod edges...`);
        const podSnapshot = normalized.podSnapshot || { active: [], passive: [] };
        const allPodIds = [
            ...podSnapshot.active.map(p => ({ contractId: p.contractId, type: 'active' })),
            ...podSnapshot.passive.map(p => ({ contractId: p.contractId, type: 'passive' })),
        ];

        for (const pod of allPodIds) {
            try {
                const entry = await clusterWrite.runner.provider.call({
                    to: clusterAddr,
                    data: new ethers.Interface(CLUSTER_ABI).encodeFunctionData('getById', [pod.contractId]),
                });
                const decoded = new ethers.Interface(CLUSTER_ABI).decodeFunctionResult('getById', entry);
                const depAddr = decoded[0].contractAddr;
                if (!depAddr || depAddr === ethers.ZeroAddress) {
                    throw new Error(`contractId=${pod.contractId} not found in registry`);
                }
                if (pod.type === 'active') {
                    await sendTx(() => clusterWrite.addActivePodAfterMount(targetAddr, depAddr, pod.contractId), { label: `addActivePod contractId=${pod.contractId}` });
                } else {
                    await sendTx(() => clusterWrite.addPassivePodAfterMount(targetAddr, depAddr, pod.contractId), { label: `addPassivePod contractId=${pod.contractId}` });
                }
                console.log(`      Restored ${pod.type} pod: contractId=${pod.contractId} → ${depAddr}`);
                report.podRestoreResults.push({ contractId: pod.contractId, type: pod.type, address: depAddr, status: 'ok' });
            } catch (e) {
                console.warn(`      ⚠  Failed to restore ${pod.type} pod contractId=${pod.contractId}: ${e.message}`);
                report.podRestoreResults.push({ contractId: pod.contractId, type: pod.type, status: 'failed', error: e.message });
                report.errors.push(`Pod restore failed (${pod.type} contractId=${pod.contractId}): ${e.message}`);
            }
        }

        // 5. Update project.json
        const timestamp = Math.floor(Date.now() / 1000);
        config.fsca.alldeployedcontracts = (config.fsca.alldeployedcontracts || []).map(r => {
            if (r.address && r.address.toLowerCase() === currentAddr.toLowerCase()) {
                return { ...r, status: 'deprecated', podSnapshot: { active: currentActivePods, passive: currentPassivePods } };
            }
            if (r.address && r.address.toLowerCase() === targetAddr.toLowerCase()) {
                return { ...r, status: 'mounted' };
            }
            return r;
        });

        // Update runningcontracts
        if (!config.fsca.runningcontracts) config.fsca.runningcontracts = [];
        config.fsca.runningcontracts = config.fsca.runningcontracts.filter(
            c => c.address && c.address.toLowerCase() !== currentAddr.toLowerCase()
        );
        config.fsca.runningcontracts.push({ name: registeredName, address: targetAddr, contractId, timeStamp: timestamp });
        // Clean up unmountedcontracts — target address must not appear there after rollback
        if (config.fsca.unmountedcontracts) {
            config.fsca.unmountedcontracts = config.fsca.unmountedcontracts.filter(
                c => c.address && c.address.toLowerCase() !== targetAddr.toLowerCase()
            );
        }
        config.fsca.currentOperating = targetAddr;
        saveProjectConfig(rootDir, config);

        deleteCheckpoint(rootDir);
        writeReport(rootDir, report);

        const failedPods = report.podRestoreResults.filter(r => r.status === 'failed');
        if (failedPods.length > 0) {
            console.log(`\n⚠  Rollback complete with ${failedPods.length} pod restore failure(s). See rollback-report.json.`);
            console.log(`   Use "fsca cluster link" to manually restore failed pod edges.`);
        } else {
            console.log(`\n✓ Rollback complete: contractId=${contractId} → generation=${normalized.generation} at ${targetAddr}`);
        }

        } finally {
            lock.release();
        }

    } catch (error) {
        console.error('Rollback failed:', error.message);
        if (process.env.DEBUG) console.error(error.stack);
        process.exit(1);
    }
};
