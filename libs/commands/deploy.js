/**
 * 部署继承自 NormalTemplate 的业务合约
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
        throw new Error('project.json not found. Please run "arkheion init" first.');
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
 * 按合约类名加载 ABI 和 Bytecode
 */
function loadArtifact(rootDir, contractName) {
    const possiblePaths = [
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'lib', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'structure', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'wallet', `${contractName}.sol`, `${contractName}.json`),
        path.join(rootDir, 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    }
    throw new Error(`Artifact not found for "${contractName}". Run "npx hardhat compile" first.`);
}

const { confirm } = require('./confirm');
const { nextDeploySeq } = require('./version');
const { scanContractConflicts, scanAllConflicts, scanIdConflicts, failOnConflict, failOnAllConflicts } = require('./contractConflicts');

module.exports = async function deploy({ rootDir, args = {} }) {
    try {
        const contractName = args.contract;
        const description = args.description || contractName;

        if (!contractName) {
            throw new Error('--contract required: Solidity contract class name (e.g. TradeEngine)');
        }

        console.log(`Preparing to deploy contract: ${contractName} (name: ${description})`);

        const ok = await confirm(`Deploy contract "${contractName}"?`, !!args.yes);
        if (!ok) {
            console.log('Aborted.');
            return;
        }

        // 1. Compile
        console.log("Compiling contracts...");
        try {
            execSync('npx hardhat compile', { cwd: rootDir, stdio: 'inherit' });
        } catch (e) {
            throw new Error("Compilation failed");
        }

        // 1b. Conflict check (post-compile, artifacts now exist)
        const { hits, conflict } = scanContractConflicts(rootDir, contractName);
        if (conflict) failOnConflict(contractName, hits);
        const allConflicts = scanAllConflicts(rootDir);
        const { idConflicts } = scanIdConflicts(rootDir);
        failOnAllConflicts({ ...allConflicts, idConflicts });

        // 2. Load Config & Connect
        const config = loadProjectConfig(rootDir);
        if (!config.arkheion || !config.arkheion.clusterAddress) {
            throw new Error("Cluster address not configured properly.");
        }

        const provider = getProvider(config.network.rpc);
        const signer = getSigner(config.account.privateKey, provider);

        // 3. Load Artifact
        const artifact = loadArtifact(rootDir, contractName);
        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);

        // 4. Deploy
        // constructor(address _clusterAddress, string memory _name)
        console.log(`Deploying NormalTemplate...`);
        console.log(`  Cluster: ${config.arkheion.clusterAddress}`);
        console.log(`  Name: ${description}`);

        const contract = await factory.deploy(config.arkheion.clusterAddress, description);

        console.log(`Transaction sent: ${contract.deploymentTransaction().hash}`);
        console.log(`Waiting for deployment...`);

        await contract.waitForDeployment();
        const deployedAddress = await contract.getAddress();

        console.log(`✓ Contract deployed at: ${deployedAddress}`);

        // 5. Archive deployed contract
        const timestamp = Math.floor(Date.now() / 1000);
        const dateStr = new Date(timestamp * 1000).toISOString().replace(/[:.]/g, '-').slice(0, -5);

        archiveDeployedContract(rootDir, {
            name: description,
            address: deployedAddress,
            timestamp: timestamp,
            dateStr: dateStr,
            txHash: contract.deploymentTransaction().hash,
            cluster: config.arkheion.clusterAddress,
            network: config.network.name
        });

        // 5b. Cleanup undeployed source/artifacts
        const { resolveCleanupMode, performCleanup, findSourceFile, findArtifactFile } = require('./cleanup');
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
                if (action.status === 'ok') console.log(`✓ Cleanup [${cleanupMode}]: ${action.fileType} ${action.action}`);
                else if (action.status === 'skipped') console.log(`  Cleanup: ${action.fileType} already absent, skipped`);
                else console.warn(`⚠  Cleanup error (${action.fileType}): ${action.error}`);
            }
            if (cleanupResult.errors.length > 0) {
                console.warn(`⚠  Cleanup completed with ${cleanupResult.errors.length} error(s)`);
            }
            // Write cleanup-report.json
            const reportPath = require('path').join(rootDir, 'cleanup-report.json');
            require('fs').writeFileSync(reportPath, JSON.stringify({
                timestamp: new Date().toISOString(),
                mode: cleanupMode,
                actions: cleanupResult.actions,
                errors: cleanupResult.errors,
            }, null, 2), 'utf-8');
        }

        // 6. Update Cache
        if (!config.arkheion.alldeployedcontracts) config.arkheion.alldeployedcontracts = [];
        if (!config.arkheion.unmountedcontracts) config.arkheion.unmountedcontracts = [];

        const deploySeq = nextDeploySeq(config.arkheion.alldeployedcontracts);
        const contractData = {
            name: description,
            address: deployedAddress,
            contractId: null, // Not registered yet
            generation: null,
            deploySeq,
            status: 'deployed',
            timeStamp: timestamp,
            deployTx: contract.deploymentTransaction().hash,
            podSnapshot: { active: [], passive: [] },
        };

        config.arkheion.alldeployedcontracts.push(contractData);
        config.arkheion.unmountedcontracts.push(contractData);

        // Set currentOperating
        config.arkheion.currentOperating = deployedAddress;
        console.log(`Updated currentOperating to ${deployedAddress}`);

        saveProjectConfig(rootDir, config);
        console.log(`✓ Updated project.json cache.`);

    } catch (error) {
        console.error('Failed to deploy:', error.message);
        process.exit(1);
    }
};

/**
 * 归档已部署的合约
 * 将合约源码复制到 deployed 目录,并添加元数据
 */
function archiveDeployedContract(rootDir, metadata) {
    const { name, address, timestamp, dateStr, txHash, cluster, network } = metadata;

    // 源文件路径 (normaltemplate.sol)
    const sourcePath = path.join(rootDir, 'contracts', 'undeployed', 'lib', 'normaltemplate.sol');

    // 目标目录
    const deployedDir = path.join(rootDir, 'contracts', 'deployed');
    if (!fs.existsSync(deployedDir)) {
        fs.mkdirSync(deployedDir, { recursive: true });
    }

    // 目标文件名: normaltemplate_MyPod_2026-02-03T13-00-00.sol
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_');
    const targetFileName = `normaltemplate_${sanitizedName}_${dateStr}.sol`;
    const targetPath = path.join(deployedDir, targetFileName);

    // 读取源文件
    if (!fs.existsSync(sourcePath)) {
        console.warn(`⚠️  Source file not found: ${sourcePath}`);
        return;
    }

    const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

    // 添加元数据注释
    const metadataComment = `/**
 * Arkheion Deployed Contract Archive
 * 
 * Contract Name: ${name}
 * Deployed Address: ${address}
 * Deploy Transaction: ${txHash}
 * Cluster Address: ${cluster}
 * Network: ${network}
 * Deploy Timestamp: ${timestamp}
 * Deploy Date: ${new Date(timestamp * 1000).toISOString()}
 * 
 * This file is an archived copy of the deployed contract.
 * DO NOT modify this file. For new deployments, use contracts/undeployed/
 */

`;

    const archivedContent = metadataComment + sourceContent;

    // 写入目标文件
    fs.writeFileSync(targetPath, archivedContent, 'utf-8');

    // 同时保存 JSON 元数据
    const metadataPath = path.join(deployedDir, `${sanitizedName}_${dateStr}.json`);
    const metadataJson = {
        name,
        address,
        deployTx: txHash,
        cluster,
        network,
        timestamp,
        deployDate: new Date(timestamp * 1000).toISOString(),
        sourceFile: targetFileName,
        compiler: 'hardhat',
        template: 'normaltemplate.sol'
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadataJson, null, 2), 'utf-8');

    console.log(`✓ Archived to: ${path.relative(rootDir, targetPath)}`);
    console.log(`✓ Metadata saved: ${path.relative(rootDir, metadataPath)}`);
}

