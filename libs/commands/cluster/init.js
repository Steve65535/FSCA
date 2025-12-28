/**
 * 部署 FSCA 集群
 * 1. 使用本地钱包部署 MultiSigWallet（构造函数使用 config 文件里的钱包地址，初始投票数设为1）
 * 2. 使用本地钱包部署 ClusterManager（rootAdmin 设为多签钱包地址）
 * 3. 使用多签钱包签名，调用 ClusterManager 的 addOperator，把 config 文件里的钱包加入 operator
 * 4. 使用 operator 钱包（config 文件里的钱包）部署 EvokerManager 和 RightManager（构造函数用 ClusterManager 地址）
 * 5. 使用多签钱包在 ClusterManager 中设置 EvokerManager 和 RightManager 地址
 * 6. 将部署的合约文件从 undeployed 复制到 deployed 文件夹
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ethers } = require('ethers');

// 加载 chain 目录下的封装函数
const chainDeploy = require('../../../chain/deploy');
const chainProvider = require('../../../chain/provider');
const chainTx = require('../../../chain/tx');
const chainAbi = require('../../../chain/abi');
const walletSigner = require('../../../wallet/signer');

/**
 * 加载项目配置
 * @param {string} rootDir - 项目根目录
 * @returns {Object} 配置对象
 */
function loadProjectConfig(rootDir) {
  const configPath = path.join(rootDir, 'project.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('project.json not found. Please run "fsca init" first.');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (!config.network || !config.network.rpc) {
    throw new Error('Network RPC URL not configured in project.json');
  }

  if (!config.account || !config.account.privateKey) {
    throw new Error('Account private key not configured in project.json');
  }

  return config;
}

// 使用 chain 目录下的封装函数
const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;
const deployContract = chainDeploy.deployContract;
const callContract = chainTx.callContract;
const encodeCall = chainAbi.encodeCall;

/**
 * 加载编译后的合约 artifact
 * @param {string} rootDir - 项目根目录
 * @param {string} contractName - 合约名称
 * @returns {Object} { abi, bytecode }
 */
function loadArtifact(rootDir, contractName) {
  // 尝试从 artifacts 目录加载
  const artifactPath = path.join(rootDir, 'artifacts', 'contracts', 'undeployed', `${contractName}.sol`, `${contractName}.json`);

  if (!fs.existsSync(artifactPath)) {
    // 尝试其他可能的路径
    const altPaths = [
      path.join(rootDir, 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`),
      path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'wallet', `${contractName}.sol`, `${contractName}.json`),
      path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'structure', `${contractName}.sol`, `${contractName}.json`),
    ];

    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        const artifact = JSON.parse(fs.readFileSync(altPath, 'utf-8'));
        return {
          abi: artifact.abi,
          bytecode: artifact.bytecode
        };
      }
    }

    throw new Error(`Contract artifact not found for ${contractName}. Please compile contracts first with "npx hardhat compile"`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode
  };
}

/**
 * 更新项目配置中的地址
 * @param {string} rootDir - 项目根目录
 * @param {Object} addresses - 地址对象
 */
function updateProjectConfig(rootDir, addresses) {
  const configPath = path.join(rootDir, 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (!config.fsca) {
    config.fsca = {};
  }

  if (addresses.multisigAddress) {
    config.fsca.multisigAddress = addresses.multisigAddress;
  }
  if (addresses.clusterAddress) {
    config.fsca.clusterAddress = addresses.clusterAddress;
  }
  if (addresses.evokerManagerAddress) {
    config.fsca.evokerManagerAddress = addresses.evokerManagerAddress;
  }
  if (addresses.rightManagerAddress) {
    config.fsca.rightManagerAddress = addresses.rightManagerAddress;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('✓ Updated project.json with deployed addresses');
}

/**
 * 主函数
 * @param {Object} params - 命令参数
 * @param {string} params.rootDir - 项目根目录
 * @param {Object} params.args - 命令行参数
 */
module.exports = async function clusterInit({ rootDir, args = {} }) {
  console.log('Deploying FSCA cluster...');
  console.log('');

  try {
    // 1. 加载配置
    const config = loadProjectConfig(rootDir);
    const threshold = args.threshold || 1;

    // 2. 检查合约是否已编译
    const artifactsDir = path.join(rootDir, 'artifacts');
    if (!fs.existsSync(artifactsDir)) {
      console.log('Compiling contracts...');
      try {
        execSync('npx hardhat compile', { cwd: rootDir, stdio: 'inherit' });
      } catch (error) {
        // Check if the error is due to missing "type": "module"
        // Since stdio is inherit, we can't easily capture output here, but we can infer from the user report
        // OR we can try to run the fix blindly if it failed, or assume it's the common error if we are in this context.
        // A safer approach: check if package.json misses type: module and hardhat.config.js exists.

        console.warn('Compilation failed. Attempting to fix common issues...');

        // Try to fix "Hardhat only supports ESM projects" error
        try {
          console.log('Setting "type": "module" in package.json...');
          execSync('npm pkg set type="module"', { cwd: rootDir, stdio: 'inherit' });
          console.log('Retrying compilation...');
          execSync('npx hardhat compile', { cwd: rootDir, stdio: 'inherit' });
        } catch (retryError) {
          throw new Error('Compilation failed even after applying fixes: ' + retryError.message);
        }
      }
    }

    // 3. 初始化 Provider 和 Signer
    const provider = getProvider(config.network.rpc);
    const signer = getSigner(config.account.privateKey, provider);
    const deployerAddress = await signer.getAddress();

    console.log(`Deployer address: ${deployerAddress}`);
    console.log(`Network: ${config.network.name} (${config.network.rpc})`);
    console.log('');

    // 4. 使用本地钱包部署多签钱包
    console.log('Step 1: Deploying MultiSigWallet using local wallet...');
    const multisigArtifact = loadArtifact(rootDir, 'MultiSigWallet');
    const owners = [deployerAddress]; // 初始时只有 config 文件里的钱包地址
    const multisigAddress = await deployContract(
      signer,
      multisigArtifact.abi,
      multisigArtifact.bytecode,
      [owners, threshold] // threshold 默认为 1
    );
    console.log(`✓ MultiSigWallet deployed at: ${multisigAddress}`);
    console.log('');

    // 5. 使用本地钱包部署 ClusterManager
    console.log('Step 2: Deploying ClusterManager using local wallet...');
    const clusterArtifact = loadArtifact(rootDir, 'ClusterManager');
    const clusterAddress = await deployContract(
      signer,
      clusterArtifact.abi,
      clusterArtifact.bytecode,
      [multisigAddress] // rootAdmin 设置为多签钱包地址
    );
    console.log(`✓ ClusterManager deployed at: ${clusterAddress}`);
    console.log('');

    // 6. 使用多签钱包将 config 文件里的钱包加入 ClusterManager 的 operator
    console.log('Step 3: Adding operator to ClusterManager via MultiSig...');
    const multisigContract = new ethers.Contract(multisigAddress, multisigArtifact.abi, signer);
    const addOperatorData = encodeCall(
      clusterArtifact.abi,
      'addOperator',
      [deployerAddress] // 将 config 文件里的钱包地址加入 operator
    );

    // 通过多签钱包提交、确认并执行交易
    const addOperatorSubmit = await multisigContract.submitTransaction(
      clusterAddress,
      0,
      addOperatorData
    );
    await addOperatorSubmit.wait();
    const addOperatorTxIndex = await multisigContract.transactionCount() - 1n;
    await (await multisigContract.confirmTransaction(addOperatorTxIndex)).wait();
    await (await multisigContract.executeTransaction(addOperatorTxIndex)).wait();
    console.log(`✓ Added ${deployerAddress} as operator in ClusterManager`);
    console.log('');

    // 7. 使用 operator 钱包（config 文件里的钱包）部署 EvokerManager
    console.log('Step 4: Deploying EvokerManager using operator wallet (using ClusterManager address)...');
    const evokerArtifact = loadArtifact(rootDir, 'EvokerManager');
    const evokerAddress = await deployContract(
      signer, // 使用 operator 钱包（config 文件里的钱包）
      evokerArtifact.abi,
      evokerArtifact.bytecode,
      [clusterAddress] // 使用 ClusterManager 地址
    );
    console.log(`✓ EvokerManager deployed at: ${evokerAddress}`);
    console.log('');

    // 8. 使用 operator 钱包（config 文件里的钱包）部署 RightManager
    console.log('Step 5: Deploying RightManager (ProxyWallet) using operator wallet (using ClusterManager address)...');
    const proxyWalletArtifact = loadArtifact(rootDir, 'ProxyWallet');
    const rightManagerAddress = await deployContract(
      signer, // 使用 operator 钱包（config 文件里的钱包）
      proxyWalletArtifact.abi,
      proxyWalletArtifact.bytecode,
      [clusterAddress] // 使用 ClusterManager 地址
    );
    console.log(`✓ RightManager (ProxyWallet) deployed at: ${rightManagerAddress}`);
    console.log('');

    // 9. 在 ClusterManager 中设置 EvokerManager 和 RightManager（通过多签钱包）
    console.log('Step 6: Configuring ClusterManager via MultiSig...');
    const setEvokerData = encodeCall(
      clusterArtifact.abi,
      'setEvokerManager',
      [evokerAddress]
    );

    const setRightData = encodeCall(
      clusterArtifact.abi,
      'setRightManager',
      [rightManagerAddress]
    );

    // 提交并执行设置 EvokerManager 的交易
    const setEvokerSubmit = await multisigContract.submitTransaction(
      clusterAddress,
      0,
      setEvokerData
    );
    await setEvokerSubmit.wait();
    const setEvokerTxIndex = await multisigContract.transactionCount() - 1n;
    await (await multisigContract.confirmTransaction(setEvokerTxIndex)).wait();
    await (await multisigContract.executeTransaction(setEvokerTxIndex)).wait();
    console.log('✓ Set EvokerManager in ClusterManager');

    // 提交并执行设置 RightManager 的交易
    const setRightSubmit = await multisigContract.submitTransaction(
      clusterAddress,
      0,
      setRightData
    );
    await setRightSubmit.wait();
    const setRightTxIndex = await multisigContract.transactionCount() - 1n;
    await (await multisigContract.confirmTransaction(setRightTxIndex)).wait();
    await (await multisigContract.executeTransaction(setRightTxIndex)).wait();
    console.log('✓ Set RightManager in ClusterManager');
    console.log('');

    // 10. 将部署的合约文件从 undeployed 复制到 deployed 文件夹
    console.log('Step 7: Moving deployed contracts to deployed folder...');
    const contractsDir = path.join(rootDir, 'contracts');
    const undeployedDir = path.join(contractsDir, 'undeployed');
    const deployedDir = path.join(contractsDir, 'deployed');

    // 确保 deployed 目录存在
    if (!fs.existsSync(deployedDir)) {
      fs.mkdirSync(deployedDir, { recursive: true });
    }

    // 需要复制的合约文件
    const contractsToMove = [
      { name: 'ClusterManager', path: 'structure/clustermanager.sol' },
      { name: 'EvokerManager', path: 'structure/evokermanager.sol' },
      { name: 'ProxyWallet', path: 'wallet/proxywallet.sol' }
    ];

    for (const contract of contractsToMove) {
      const sourcePath = path.join(undeployedDir, contract.path);
      const targetPath = path.join(deployedDir, contract.path);

      // 创建目标目录
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✓ Copied ${contract.name} to deployed folder`);
      } else {
        console.warn(`⚠ Warning: ${contract.name} not found at ${sourcePath}`);
      }
    }
    console.log('');

    // 9. 更新 project.json
    updateProjectConfig(rootDir, {
      multisigAddress,
      clusterAddress,
      evokerManagerAddress: evokerAddress,
      rightManagerAddress
    });

    console.log('');
    console.log('✓ FSCA cluster deployed successfully!');
    console.log('');
    console.log('Deployed addresses:');
    console.log(`  MultiSigWallet: ${multisigAddress}`);
    console.log(`  ClusterManager: ${clusterAddress}`);
    console.log(`  EvokerManager: ${evokerAddress}`);
    console.log(`  RightManager: ${rightManagerAddress}`);
    console.log('');
    console.log('All addresses have been saved to project.json');

  } catch (error) {
    console.error('Failed to deploy cluster:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

