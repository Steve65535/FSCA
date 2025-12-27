/**
 * 部署 NormalTemplate 合约
 * 1. 编译合约 (npx hardhat compile)
 * 2. 部署合约
 * 3. 更新 project.json 缓存 (alldeployedcontracts, unmountedcontracts)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');

// 加载 chain 目录下的封装函数
const chainProvider = require('../../chain/provider');
const walletSigner = require('../../wallet/signer');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;

/**
 * 加载项目配置
 */
function loadProjectConfig(rootDir) {
    const configPath = path.join(rootDir, 'project.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('project.json not found. Please run "fsca init" first.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * 保存项目配置
 */
function saveProjectConfig(rootDir, config) {
    const configPath = path.join(rootDir, 'project.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 加载 NormalTemplate ABI 和 Bytecode
 */
function loadNormalTemplateArtifact(rootDir) {
    // 优先查找 undeployed 目录，因为这是源码目录
    const possiblePaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', 'normalTemplate.sol', 'normalTemplate.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'lib', 'normaltemplate.sol', 'normalTemplate.json'),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    }
    throw new Error("Could not find normalTemplate artifact. Did you compile?");
}

module.exports = async function deploy({ rootDir, args = {} }) {
    try {
        const description = args.description;
        if (!description) {
            throw new Error("Description is required");
        }

        console.log(`Preparing to deploy contract: ${description}`);

        // 1. Compile
        console.log("Compiling contracts...");
        try {
            execSync('npx hardhat compile', { cwd: rootDir, stdio: 'inherit' });
        } catch (e) {
            throw new Error("Compilation failed");
        }

        // 2. Load Config & Connect
        const config = loadProjectConfig(rootDir);
        if (!config.fsca || !config.fsca.clusterAddress) {
            throw new Error("Cluster address not configured properly.");
        }

        const provider = getProvider(config.network.rpc);
        const signer = getSigner(provider, config.account.privateKey);

        // 3. Load Artifact
        const artifact = loadNormalTemplateArtifact(rootDir);
        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);

        // 4. Deploy
        // constructor(address _clusterAddress, string memory _name)
        console.log(`Deploying NormalTemplate...`);
        console.log(`  Cluster: ${config.fsca.clusterAddress}`);
        console.log(`  Name: ${description}`);

        const contract = await factory.deploy(config.fsca.clusterAddress, description);

        console.log(`Transaction sent: ${contract.deploymentTransaction().hash}`);
        console.log(`Waiting for deployment...`);

        await contract.waitForDeployment();
        const deployedAddress = await contract.getAddress();

        console.log(`✓ Contract deployed at: ${deployedAddress}`);

        // 5. Update Cache
        const timestamp = Math.floor(Date.now() / 1000);
        const contractData = {
            name: description,
            address: deployedAddress,
            contractId: null, // Not registered yet
            timeStamp: timestamp,
            deployTx: contract.deploymentTransaction().hash
        };

        if (!config.fsca.alldeployedcontracts) config.fsca.alldeployedcontracts = [];
        if (!config.fsca.unmountedcontracts) config.fsca.unmountedcontracts = [];

        config.fsca.alldeployedcontracts.push(contractData);
        config.fsca.unmountedcontracts.push(contractData);

        // Set currentOperating
        config.fsca.currentOperating = deployedAddress;
        console.log(`Updated currentOperating to ${deployedAddress}`);

        saveProjectConfig(rootDir, config);
        console.log(`✓ Updated project.json cache.`);

    } catch (error) {
        console.error('Failed to deploy:', error.message);
        process.exit(1);
    }
};
