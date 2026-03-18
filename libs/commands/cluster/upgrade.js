/**
 * 热替换集群中的合约
 * 1. 从 ClusterManager 读取旧合约信息 (by ID)
 * 2. 读取旧合约的 active/passive pod 配置
 * 3. 编译并部署新合约 (constructor: clusterAddress)
 * 4. 将旧合约的 pod 配置复制到新合约 (BeforeMount)
 * 5. deleteContract(id) 卸载旧合约
 * 6. registerContract(id, name, newAddr) 挂载新合约
 * 7. 更新 project.json 缓存
 *
 * 如果新合约依赖关系不同，使用 --skip-copy-pods 跳过第4步，
 * 之后手动用 "fsca cluster link" 配置新的 pod 关系。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');

const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');
const chainDeploy = require('../../../chain/deploy');
const credentials = require('../../../wallet/credentials');
const { resolveCleanupMode, performCleanup, findSourceFile, findArtifactFile } = require('../cleanup');
const { confirm } = require('../confirm');
const analyze = require('./auto/analyze');
const { nextGeneration, nextDeploySeq } = require('../version');
const { sendTx } = require('../txExecutor');
const { acquireLock } = require('../clusterLock');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;
const deployContract = chainDeploy.deployContract;

// ClusterManager 最小 ABI
const CLUSTER_ABI = [
    'function getById(uint32 id) view returns (tuple(uint32 contractId, string name, address contractAddr))',
    'function addActivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function addPassivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external',
    'function deleteContract(uint32 id) external',
    'function registerContract(uint32 id, string memory name, address contractAddr) external'
];

// normalTemplate 最小 ABI（读取 pod 配置用）
const TEMPLATE_ABI = [
    'function getAllActiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])',
    'function getAllPassiveModules() view returns (tuple(uint32 contractId, address moduleAddress)[])'
];

function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found. Run "fsca init" first.');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const rpcUrl = credentials.resolveRpcUrl(config, rootDir);
    const privateKey = credentials.resolvePrivateKey(config, rootDir);
    if (!rpcUrl) throw new Error('RPC URL not configured (set FSCA_RPC_URL or network.rpc in project.json)');
    if (!privateKey) throw new Error('Private key not configured (set FSCA_PRIVATE_KEY or account.privateKey in project.json)');
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

function loadArtifact(rootDir, contractName) {
    const searchPaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'structure', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'wallet', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`),
    ];
    for (const p of searchPaths) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    }
    throw new Error(`Artifact not found for "${contractName}". Run "npx hardhat compile" first.`);
}

function buildConstructorArgs(artifact, clusterAddr, registeredName) {
    const inputs = artifact?.abi?.find(item => item.type === 'constructor')?.inputs || [];
    if (inputs.length === 0) return [];
    if (inputs.length === 1) return [clusterAddr];
    if (inputs.length === 2) return [clusterAddr, registeredName];
    throw new Error(
        `Unsupported constructor for upgrade target: expected 0/1/2 args, got ${inputs.length}.`
    );
}

module.exports = async function upgrade({ rootDir, args = {} }) {
    try {
        const { id, contract: contractName, 'skip-copy-pods': skipCopyPods } = args;

        if (!id) throw new Error('--id required: contract ID in cluster registry');
        if (!contractName) throw new Error('--contract required: new contract artifact name');

        // Pre-flight: static analysis
        console.log('[0/6] Running pre-flight checks...');
        const { errors: preflightErrors, warnings: preflightWarnings, funcCycles } = analyze(rootDir);
        for (const w of preflightWarnings) console.warn(`  ⚠  ${w}`);
        if (funcCycles.length > 0) {
            console.warn(`  ⚠  ${funcCycles.length} function-level cycle(s) detected — review before upgrading.`);
        }
        if (preflightErrors.length > 0) {
            console.error(`\n✗ Pre-flight failed: ${preflightErrors.length} annotation error(s). Fix them before upgrading.`);
            process.exit(1);
        }
        console.log('      Pre-flight passed.');

        const ok = await confirm(`Hot-swap contract #${id} with "${contractName}"? This will unmount the old contract and mount the new one.`, !!args.yes);
        if (!ok) {
            console.log('Aborted.');
            return;
        }

        const config = loadProjectConfig(rootDir);
        const contractId = Number(id);
        const clusterAddr = config.fsca.clusterAddress;

        // Checkpoint helpers
        const cpPath = path.join(rootDir, 'upgrade-checkpoint.json');
        function writeCheckpoint(data) {
            fs.writeFileSync(cpPath, JSON.stringify(data, null, 2), 'utf-8');
        }
        function deleteCheckpoint() {
            if (fs.existsSync(cpPath)) fs.unlinkSync(cpPath);
        }

        // Resume / restart logic
        let checkpoint = null;
        if (fs.existsSync(cpPath)) {
            checkpoint = JSON.parse(fs.readFileSync(cpPath, 'utf-8'));
            if (checkpoint.clusterAddress !== clusterAddr || checkpoint.contractId !== contractId) {
                checkpoint = null; // stale checkpoint for different cluster/contract
            }
        }
        if (checkpoint && args.restart) {
            deleteCheckpoint();
            checkpoint = null;
            console.log('  Restarting from scratch (--restart).');
        } else if (checkpoint && !args.resume) {
            const resume = await confirm(`Found upgrade-checkpoint.json for contractId=${contractId}. Resume from last checkpoint?`, false);
            if (!resume) { deleteCheckpoint(); checkpoint = null; }
        }
        if (checkpoint) {
            console.log(`  Resuming upgrade from step: ${checkpoint.completedSteps.join(', ') || '(none)'}`);
        }

        const completedSteps = new Set(checkpoint ? checkpoint.completedSteps : []);
        const cpState = checkpoint ? checkpoint.state : {};

        const provider = getProvider(config.network.rpc);
        const rawSigner = getSigner(config.account.privateKey, provider);
        const signer = new ethers.NonceManager(rawSigner);

        const clusterRead = new ethers.Contract(clusterAddr, CLUSTER_ABI, provider);
        const clusterWrite = new ethers.Contract(clusterAddr, CLUSTER_ABI, signer);

        const lock = acquireLock(rootDir, clusterAddr, 'cluster upgrade');
        try {

        // 1. 读取旧合约注册信息
        console.log(`[1/6] Fetching contract #${contractId} from registry...`);
        const existing = await clusterRead.getById(contractId);
        const oldAddr = existing.contractAddr;
        const registeredName = existing.name;
        console.log(`      Name: ${registeredName}`);
        console.log(`      Old address: ${oldAddr}`);

        // 2. 读取旧合约 pod 配置
        let activeModules = [];
        let passiveModules = [];
        if (!skipCopyPods) {
            console.log(`[2/6] Reading pod configuration from old contract...`);
            const oldContract = new ethers.Contract(oldAddr, TEMPLATE_ABI, provider);
            activeModules = await oldContract.getAllActiveModules();
            passiveModules = await oldContract.getAllPassiveModules();
            console.log(`      Active pods: ${activeModules.length}  Passive pods: ${passiveModules.length}`);
        } else {
            console.log(`[2/6] Skipping pod copy (--skip-copy-pods). Configure manually after upgrade.`);
        }

        // 3. 编译 + 部署新合约
        console.log(`[3/6] Compiling and deploying ${contractName}...`);
        let newAddr = cpState.newAddr || null;
        if (!completedSteps.has('deploy')) {
            const artifactsDir = path.join(rootDir, 'artifacts');
            if (!fs.existsSync(artifactsDir)) {
                console.log('      Artifacts not found, compiling...');
                execSync('npx hardhat compile', { cwd: rootDir, stdio: 'inherit' });
            }
            const artifact = loadArtifact(rootDir, contractName);
            const constructorArgs = buildConstructorArgs(artifact, clusterAddr, registeredName);
            newAddr = await deployContract(signer, artifact.abi, artifact.bytecode, constructorArgs);
            completedSteps.add('deploy');
            writeCheckpoint({ clusterAddress: clusterAddr, contractId, completedSteps: [...completedSteps], state: { newAddr } });
        } else {
            console.log(`  ↩ skip deploy (already done): ${newAddr}`);
        }
        console.log(`      Deployed at: ${newAddr}`);

        // 4. 将旧合约 pod 配置写入新合约（BeforeMount，此时 whetherMounted=0）
        if (!skipCopyPods && (activeModules.length > 0 || passiveModules.length > 0)) {
            console.log(`[4/6] Copying pod configuration to new contract...`);
            for (const mod of activeModules) {
                const stepKey = `pod-copy:active:${mod.contractId}`;
                if (completedSteps.has(stepKey)) { console.log(`  ↩ skip ${stepKey}`); continue; }
                await sendTx(() => clusterWrite.addActivePodBeforeMount(newAddr, mod.moduleAddress, mod.contractId), { label: stepKey });
                console.log(`      Active  id=${mod.contractId}  ${mod.moduleAddress}`);
                completedSteps.add(stepKey);
                writeCheckpoint({ clusterAddress: clusterAddr, contractId, completedSteps: [...completedSteps], state: { newAddr } });
            }
            for (const mod of passiveModules) {
                const stepKey = `pod-copy:passive:${mod.contractId}`;
                if (completedSteps.has(stepKey)) { console.log(`  ↩ skip ${stepKey}`); continue; }
                await sendTx(() => clusterWrite.addPassivePodBeforeMount(newAddr, mod.moduleAddress, mod.contractId), { label: stepKey });
                console.log(`      Passive id=${mod.contractId}  ${mod.moduleAddress}`);
                completedSteps.add(stepKey);
                writeCheckpoint({ clusterAddress: clusterAddr, contractId, completedSteps: [...completedSteps], state: { newAddr } });
            }
        } else {
            console.log(`[4/6] No pods to configure.`);
        }

        // 5. 卸载旧合约
        console.log(`[5/6] Unmounting old contract #${contractId}...`);
        if (!completedSteps.has('delete')) {
            await sendTx(() => clusterWrite.deleteContract(contractId), { label: `deleteContract #${contractId}` });
            completedSteps.add('delete');
            writeCheckpoint({ clusterAddress: clusterAddr, contractId, completedSteps: [...completedSteps], state: { newAddr } });
        } else {
            console.log(`  ↩ skip delete (already done)`);
        }
        console.log(`      Unmounted: ${oldAddr}`);

        // 6. 注册新合约
        console.log(`[6/6] Registering new contract...`);
        if (!completedSteps.has('register')) {
            await sendTx(() => clusterWrite.registerContract(contractId, registeredName, newAddr), { label: `registerContract #${contractId}` });
            completedSteps.add('register');
            writeCheckpoint({ clusterAddress: clusterAddr, contractId, completedSteps: [...completedSteps], state: { newAddr } });
        } else {
            console.log(`  ↩ skip register (already done)`);
        }
        console.log(`      Mounted: ${newAddr}`);

        // 更新 project.json
        const timestamp = Math.floor(Date.now() / 1000);
        if (!config.fsca.alldeployedcontracts) config.fsca.alldeployedcontracts = [];

        const podSnapshot = {
            active: activeModules.map(m => ({ contractId: Number(m.contractId) })),
            passive: passiveModules.map(m => ({ contractId: Number(m.contractId) })),
        };

        config.fsca.alldeployedcontracts = config.fsca.alldeployedcontracts.map(r => {
            if (r.address && r.address.toLowerCase() === oldAddr.toLowerCase()) {
                return { ...r, status: 'deprecated', podSnapshot };
            }
            return r;
        });

        const newGen = nextGeneration(config.fsca.alldeployedcontracts, contractId);
        const newSeq = nextDeploySeq(config.fsca.alldeployedcontracts);
        config.fsca.alldeployedcontracts.push({
            name: registeredName,
            address: newAddr,
            contractId,
            generation: newGen,
            deploySeq: newSeq,
            status: 'mounted',
            timeStamp: timestamp,
            upgradedFrom: oldAddr,
            deployTx: null,
            podSnapshot: { active: [], passive: [] },
        });

        if (config.fsca.unmountedcontracts) {
            config.fsca.unmountedcontracts = config.fsca.unmountedcontracts.filter(c => c.address !== oldAddr);
        }
        if (!config.fsca.runningcontracts) config.fsca.runningcontracts = [];
        config.fsca.runningcontracts = config.fsca.runningcontracts.filter(
            c => c.address && c.address.toLowerCase() !== oldAddr.toLowerCase()
        );
        config.fsca.runningcontracts.push({ name: registeredName, address: newAddr, contractId, timeStamp: timestamp });

        config.fsca.currentOperating = newAddr;
        saveProjectConfig(rootDir, config);
        console.log('      Updated project.json');

        deleteCheckpoint();

        // Cleanup new contract's source/artifacts
        const cleanupMode = resolveCleanupMode(args, config);
        if (cleanupMode !== 'keep') {
            const sourcePath = findSourceFile(rootDir, contractName);
            const artifactPath = findArtifactFile(rootDir, contractName);
            const cleanupResult = performCleanup({
                mode: cleanupMode,
                files: [{ sourcePath, artifactPath, contractName }],
                rootDir,
            });
            for (const action of cleanupResult.actions) {
                if (action.status === 'ok') console.log(`      Cleanup [${cleanupMode}]: ${action.fileType} ${action.action}`);
                else if (action.status === 'skipped') console.log(`      Cleanup: ${action.fileType} skipped`);
                else console.warn(`      ⚠  Cleanup error (${action.fileType}): ${action.error}`);
            }
            if (cleanupResult.errors.length > 0) {
                const reportPath = require('path').join(rootDir, 'cleanup-report.json');
                require('fs').writeFileSync(reportPath, JSON.stringify({
                    timestamp: new Date().toISOString(),
                    mode: cleanupMode,
                    actions: cleanupResult.actions,
                    errors: cleanupResult.errors,
                }, null, 2), 'utf-8');
            }
        }

        console.log('');
        console.log(`✓ Hot swap complete: ${registeredName} #${contractId}`);
        console.log(`  Old: ${oldAddr}`);
        console.log(`  New: ${newAddr}`);
        if (skipCopyPods) {
            console.log(`  Note: pods not copied. Use "fsca cluster link" to configure.`);
        }

        } finally {
            lock.release();
        }

    } catch (error) {
        console.error('Upgrade failed:', error.message);
        if (process.env.DEBUG) console.error(error.stack);
        process.exit(1);
    }
};
