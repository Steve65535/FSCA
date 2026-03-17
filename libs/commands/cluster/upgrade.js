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

        const config = loadProjectConfig(rootDir);
        const contractId = Number(id);
        const clusterAddr = config.fsca.clusterAddress;

        const provider = getProvider(config.network.rpc);
        const rawSigner = getSigner(config.account.privateKey, provider);
        // NonceManager ensures sequential nonces across deploy + multiple txs
        const signer = new ethers.NonceManager(rawSigner);

        const clusterRead = new ethers.Contract(clusterAddr, CLUSTER_ABI, provider);
        const clusterWrite = new ethers.Contract(clusterAddr, CLUSTER_ABI, signer);

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
        const artifactsDir = path.join(rootDir, 'artifacts');
        if (!fs.existsSync(artifactsDir)) {
            console.log('      Artifacts not found, compiling...');
            execSync('npx hardhat compile', { cwd: rootDir, stdio: 'inherit' });
        }
        const artifact = loadArtifact(rootDir, contractName);
        const constructorArgs = buildConstructorArgs(artifact, clusterAddr, registeredName);
        const newAddr = await deployContract(signer, artifact.abi, artifact.bytecode, constructorArgs);
        console.log(`      Deployed at: ${newAddr}`);

        // 4. 将旧合约 pod 配置写入新合约（BeforeMount，此时 whetherMounted=0）
        if (!skipCopyPods && (activeModules.length > 0 || passiveModules.length > 0)) {
            console.log(`[4/6] Copying pod configuration to new contract...`);
            for (const mod of activeModules) {
                const tx = await clusterWrite.addActivePodBeforeMount(newAddr, mod.moduleAddress, mod.contractId);
                await tx.wait();
                console.log(`      Active  id=${mod.contractId}  ${mod.moduleAddress}`);
            }
            for (const mod of passiveModules) {
                const tx = await clusterWrite.addPassivePodBeforeMount(newAddr, mod.moduleAddress, mod.contractId);
                await tx.wait();
                console.log(`      Passive id=${mod.contractId}  ${mod.moduleAddress}`);
            }
        } else {
            console.log(`[4/6] No pods to configure.`);
        }

        // 5. 卸载旧合约（触发 EvokerManager.unmount，自动清除所有边）
        console.log(`[5/6] Unmounting old contract #${contractId}...`);
        await (await clusterWrite.deleteContract(contractId)).wait();
        console.log(`      Unmounted: ${oldAddr}`);

        // 6. 注册新合约（触发 EvokerManager.mount，重建所有边）
        console.log(`[6/6] Registering new contract...`);
        await (await clusterWrite.registerContract(contractId, registeredName, newAddr)).wait();
        console.log(`      Mounted: ${newAddr}`);

        // 更新 project.json
        const timestamp = Math.floor(Date.now() / 1000);
        if (!config.fsca.alldeployedcontracts) config.fsca.alldeployedcontracts = [];
        config.fsca.alldeployedcontracts.push({
            name: registeredName,
            address: newAddr,
            contractId,
            timeStamp: timestamp,
            upgradedFrom: oldAddr,
            deployTx: null
        });
        if (config.fsca.unmountedcontracts) {
            config.fsca.unmountedcontracts = config.fsca.unmountedcontracts.filter(c => c.address !== oldAddr);
        }
        config.fsca.currentOperating = newAddr;
        saveProjectConfig(rootDir, config);
        console.log('      Updated project.json');

        console.log('');
        console.log(`✓ Hot swap complete: ${registeredName} #${contractId}`);
        console.log(`  Old: ${oldAddr}`);
        console.log(`  New: ${newAddr}`);
        if (skipCopyPods) {
            console.log(`  Note: pods not copied. Use "fsca cluster link" to configure.`);
        }

    } catch (error) {
        console.error('Upgrade failed:', error.message);
        if (process.env.DEBUG) console.error(error.stack);
        process.exit(1);
    }
};
