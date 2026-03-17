/**
 * 初始化 FSCA 项目
 * 检测并安装 hardhat，初始化项目，创建配置文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const logger = require('../../logger');

const ASCII_TITLE = `
  ███████╗███████╗ ██████╗ █████╗       ██████╗██╗     ██╗
  ██╔════╝██╔════╝██╔════╝██╔══██╗     ██╔════╝██║     ██║
  █████╗  ███████╗██║     ███████║     ██║     ██║     ██║
  ██╔══╝  ╚════██║██║     ██╔══██║     ██║     ██║     ██║
  ██║     ███████║╚██████╗██║  ██║     ╚██████╗███████╗██║
  ╚═╝     ╚══════╝ ╚═════╝╚═╝  ╚═╝      ╚═════╝╚══════╝╚═╝
`;

function printInitTitle() {
  console.log(`${logger.COLORS.brightPurple}${ASCII_TITLE}${logger.COLORS.reset}`);
  console.log(`${logger.COLORS.brightPurple}  Financial Smart Contract Architecture CLI${logger.COLORS.reset}\n`);
}

/**
 * 检查 hardhat 是否已安装
 * @param {string} rootDir - 项目根目录
 * @returns {boolean} 是否已安装
 */
function hasHardhat(rootDir) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    return 'hardhat' in deps || '@nomicfoundation/hardhat-toolbox' in deps;
  } catch (error) {
    return false;
  }
}

/**
 * 安装 hardhat
 * @param {string} rootDir - 项目根目录
 */
async function installHardhat(rootDir) {
  console.log('Hardhat not found, installing...');
  try {
    // 检查是否有 package.json，如果没有则初始化
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log('Initializing npm project...');
      execSync('npm init -y', { cwd: rootDir, stdio: 'inherit' });
    }

    // 安装 hardhat 和依赖
    console.log('Installing hardhat and dependencies...');
    execSync('npm install --save-dev hardhat@^2.26.0 @nomicfoundation/hardhat-toolbox@^5.0.0 ethers@^6.4.0', {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log('Hardhat installed successfully!');
  } catch (error) {
    console.error('Failed to install hardhat:', error.message);
    throw error;
  }
}

/**
 * 初始化 hardhat 项目
 * @param {string} rootDir - 项目根目录
 */
async function initHardhat(rootDir) {
  console.log('Initializing hardhat project...');

  // Set package.json type to module to support modern hardhat setups
  try {
    execSync('npm pkg set type="module"', { cwd: rootDir, stdio: 'ignore' });
  } catch (e) {
    // Ignore error if it fails (e.g. no package.json yet?)
  }

  // 检查是否已经初始化过 hardhat
  const hardhatConfigPath = path.join(rootDir, 'hardhat.config.js');
  const hardhatConfigTsPath = path.join(rootDir, 'hardhat.config.ts');
  if (fs.existsSync(hardhatConfigPath) || fs.existsSync(hardhatConfigTsPath)) {
    console.log('Hardhat project already initialized, skipping...');
    return;
  }

  // 直接创建 hardhat 项目结构，避免交互式输入
  try {
    createBasicHardhatConfig(rootDir);
    console.log('Hardhat project initialized successfully!');
  } catch (error) {
    console.error('Failed to initialize hardhat project:', error.message);
    throw error;
  }
}

/**
 * 创建基本的 hardhat 配置文件（备用方案）
 * @param {string} rootDir - 项目根目录
 */
function createBasicHardhatConfig(rootDir) {
  const hardhatConfigPath = path.join(rootDir, 'hardhat.config.js');
  const contractsDir = path.join(rootDir, 'contracts');
  const scriptsDir = path.join(rootDir, 'scripts');
  const testDir = path.join(rootDir, 'test');

  // 创建必要的目录
  [contractsDir, scriptsDir, testDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 创建基本的 hardhat.config.js (ESM Format)
  const hardhatConfig = `import "@nomicfoundation/hardhat-toolbox";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: "0.8.24",
  networks: {
    localnet: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
  },
};
`;

  fs.writeFileSync(hardhatConfigPath, hardhatConfig, 'utf-8');
  console.log('Created basic hardhat.config.js (ESM)');
}
/**
 * 递归复制目录
 * @param {string} srcDir - 源目录
 * @param {string} destDir - 目标目录
 * @param {string} filterExt - 文件扩展名过滤（如 '.sol'）
 */
function copyDirectory(srcDir, destDir, filterExt = null) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source directory does not exist: ${srcDir}`);
  }

  // 创建目标目录
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // 递归复制子目录
      copyDirectory(srcPath, destPath, filterExt);
    } else if (entry.isFile()) {
      // 如果指定了文件扩展名过滤，只复制匹配的文件
      if (filterExt && !entry.name.endsWith(filterExt)) {
        continue;
      }
      // 复制文件
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 加载 fsca-core 合约文件到项目
 * @param {string} rootDir - 项目根目录
 */
function loadFscaCoreFiles(rootDir) {
  console.log('Loading FSCA core contracts...');

  // 获取 fsca-core 的路径（相对于当前文件）
  // init.js 在 libs/commands/init/init.js
  // fsca-core 在 libs/fsca-core
  const currentFileDir = __dirname; // libs/commands/init
  const fscaCorePath = path.resolve(currentFileDir, '../../fsca-core');

  if (!fs.existsSync(fscaCorePath)) {
    console.warn(`Warning: FSCA core directory not found at ${fscaCorePath}`);
    console.warn('Skipping FSCA core contracts copy.');
    return;
  }

  // 目标目录：contracts/undeployed
  const contractsDir = path.join(rootDir, 'contracts');
  const undeployedDir = path.join(contractsDir, 'undeployed');
  const deployedDir = path.join(contractsDir, 'deployed');

  // 确保 contracts 目录存在
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  // 创建 deployed 和 undeployed 文件夹
  if (!fs.existsSync(deployedDir)) {
    fs.mkdirSync(deployedDir, { recursive: true });
    console.log('Created contracts/deployed directory');
  }

  if (!fs.existsSync(undeployedDir)) {
    fs.mkdirSync(undeployedDir, { recursive: true });
    console.log('Created contracts/undeployed directory');
  }

  // 复制所有 .sol 文件到 undeployed 目录，保持目录结构
  try {
    copyDirectory(fscaCorePath, undeployedDir, '.sol');
    console.log('✓ Copied FSCA core contracts to contracts/undeployed');
  } catch (error) {
    console.error('Failed to copy FSCA core contracts:', error.message);
    throw error;
  }
}

/**
 * 提示用户输入配置信息
 * @param {string} question - 提示问题
 * @param {string} defaultValue - 默认值
 * @returns {Promise<string>} 用户输入的值
 */
function promptUser(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const promptText = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;

    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * 引导用户配置基本参数
 * @param {Object} args - 命令行参数（可能已包含部分配置）
 * @returns {Promise<Object>} 配置对象
 */
async function promptForConfig(args = {}) {
  // 检查是否所有参数都已通过命令行提供
  const hasAllArgs = args.networkName && args.rpc && args.chainId !== undefined &&
    args.blockConfirmations !== undefined && args.accountPrivateKey && args.address;

  if (!hasAllArgs) {
    console.log('');
    console.log('Please configure the following settings:');
    console.log('(Press Enter to use default values)');
    console.log('Secrets are recommended via .env (FSCA_PRIVATE_KEY), not project.json');
    console.log('');
  }

  const config = {};

  // Network Name
  if (args.networkName || args.network) {
    config.networkName = args.networkName || args.network;
    if (!hasAllArgs) console.log(`Network name: ${config.networkName}`);
  } else {
    config.networkName = await promptUser('Network name', 'localnet');
  }

  // RPC URL
  if (args.rpc) {
    config.rpc = args.rpc;
    if (!hasAllArgs) console.log(`RPC URL: ${config.rpc}`);
  } else {
    config.rpc = await promptUser('RPC URL', 'http://127.0.0.1:8545');
  }

  // Chain ID
  if (args.chainId !== undefined) {
    config.chainId = parseInt(args.chainId) || 1337;
    if (!hasAllArgs) console.log(`Chain ID: ${config.chainId}`);
  } else {
    const chainIdInput = await promptUser('Chain ID', '1337');
    config.chainId = parseInt(chainIdInput) || 1337;
  }

  // Block Confirmations
  if (args.blockConfirmations !== undefined) {
    config.blockConfirmations = parseInt(args.blockConfirmations) || 1;
    if (!hasAllArgs) console.log(`Block Confirmations: ${config.blockConfirmations}`);
  } else {
    const blockConfirmationsInput = await promptUser('Block Confirmations', '1');
    config.blockConfirmations = parseInt(blockConfirmationsInput) || 1;
  }

  // Account Private Key (optional, recommended via .env)
  if (args.accountPrivateKey || args.privateKey) {
    config.accountPrivateKey = args.accountPrivateKey || args.privateKey;
    if (!hasAllArgs) console.log(`Account Private Key: ${config.accountPrivateKey ? '***' : '(empty)'}`);
  } else {
    config.accountPrivateKey = await promptUser('Account Private Key (optional, prefer FSCA_PRIVATE_KEY in .env)', '');
  }

  config.unsafeStoreKey = !!args['unsafe-store-key'];

  // Address
  if (args.address) {
    config.address = args.address;
    if (!hasAllArgs) console.log(`Account Address: ${config.address}`);
  } else {
    config.address = await promptUser('Account Address', '');
  }

  return config;
}

/**
 * 创建全局配置文件 project.json
 * @param {string} rootDir - 项目根目录
 * @param {Object} config - 配置对象
 */
function createProjectConfig(rootDir, config) {
  const projectJsonPath = path.join(rootDir, 'project.json');

  // 如果配置文件已存在，询问是否覆盖
  if (fs.existsSync(projectJsonPath)) {
    console.log('');
    console.log('⚠️  project.json already exists. It will be updated with new values.');
  }

  // 创建必要的子目录
  const configsDir = path.join(rootDir, 'configs');
  if (!fs.existsSync(configsDir)) {
    fs.mkdirSync(configsDir, { recursive: true });
  }

  const cacheDir = path.join(rootDir, '.cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const tmpDir = path.join(rootDir, '.tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // 读取现有配置（如果存在）
  let existingConfig = {};
  if (fs.existsSync(projectJsonPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
    } catch (error) {
      console.warn('Warning: Could not parse existing project.json, creating new one.');
    }
  }

  const shouldStorePrivateKey = !!config.unsafeStoreKey;

  // 合并配置，优先使用用户输入的值
  const projectConfig = {
    network: {
      name: config.networkName || existingConfig.network?.name || "localnet",
      rpc: config.rpc || existingConfig.network?.rpc || "http://127.0.0.1:8545",
      chainId: config.chainId || existingConfig.network?.chainId || 1337,
      blockConfirmations: config.blockConfirmations || existingConfig.network?.blockConfirmations || 1
    },
    account: {
      privateKey: shouldStorePrivateKey
        ? (config.accountPrivateKey || existingConfig.account?.privateKey || "")
        : (existingConfig.account?.privateKey || ""),
      address: config.address || existingConfig.account?.address || "",
      mnemonic: existingConfig.account?.mnemonic || "",
      keyStorePath: existingConfig.account?.keyStorePath || "./configs/keystore.json"
    },
    provider: existingConfig.provider || {
      type: "http",
      timeout: 10000,
      retry: 3
    },
    fsca: existingConfig.fsca || {
      clusterAddress: "0x",
      multisigAddress: "0x",
      operatorAddress: "0x",
      currentOperating: "",
      alldeployedcontracts: [],
      runningcontracts: [],
      unmountedcontracts: []
    },
    security: existingConfig.security || {
      signMode: "local",
      encryption: "aes256",
      accessControlContract: ""
    },
    system: existingConfig.system || {
      logLevel: "info",
      cachePath: "./.cache",
      tempPath: "./.tmp",
      autoUpdate: false
    }
  };

  // 写入配置文件
  fs.writeFileSync(projectJsonPath, JSON.stringify(projectConfig, null, 2), 'utf-8');
  console.log('');
  console.log('✓ Created project.json configuration file');
  if (!shouldStorePrivateKey && config.accountPrivateKey) {
    console.log('✓ Private key was not written to project.json (use FSCA_PRIVATE_KEY in .env)');
  }
}

/**
 * Ensure .env exists and contains FSCA variable keys.
 * Existing values are preserved; only missing keys are appended.
 * @param {string} rootDir - 项目根目录
 * @param {Object} config - 用户输入配置
 */
function ensureEnvFile(rootDir, config = {}) {
  const envPath = path.join(rootDir, '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const hasKey = (key) => lines.some(line => line.trim().startsWith(`${key}=`));

  const additions = [];
  if (!hasKey('FSCA_PRIVATE_KEY')) {
    additions.push(`FSCA_PRIVATE_KEY=${config.accountPrivateKey || ''}`);
  }
  if (!hasKey('FSCA_RPC_URL')) {
    additions.push(`FSCA_RPC_URL=${config.rpc || ''}`);
  }

  if (!fs.existsSync(envPath)) {
    const header = [
      '# FSCA CLI environment variables',
      '# Keep secrets here, do not commit real keys',
      ''
    ].join('\n');
    fs.writeFileSync(envPath, header, 'utf-8');
  }

  if (additions.length > 0) {
    const prefix = fs.readFileSync(envPath, 'utf-8').endsWith('\n') ? '' : '\n';
    fs.appendFileSync(envPath, `${prefix}${additions.join('\n')}\n`, 'utf-8');
    console.log('✓ Updated .env with FSCA variable names');
  } else {
    console.log('✓ .env already contains FSCA variable names');
  }
}

/**
 * 主函数
 * @param {Object} params - 命令参数
 * @param {string} params.rootDir - 项目根目录
 * @param {Object} params.args - 命令行参数
 */
module.exports = async function init({ rootDir, args = {} }) {
  printInitTitle();
  console.log('Initializing FSCA project...');
  console.log('');

  try {
    // 1. 检测 hardhat
    const hasHardhatInstalled = hasHardhat(rootDir);

    if (!hasHardhatInstalled) {
      // 2. 如果没有 hardhat，先安装
      await installHardhat(rootDir);
    } else {
      console.log('Hardhat already installed, skipping installation...');
    }

    // 3. 初始化 hardhat 项目
    await initHardhat(rootDir);

    // 4. 加载 FSCA core 合约文件
    loadFscaCoreFiles(rootDir);

    // 5. 引导用户配置基本参数
    const userConfig = await promptForConfig(args);

    // 6. 创建全局配置文件 project.json
    createProjectConfig(rootDir, userConfig);
    // 7. 确保 .env 存在且包含关键环境变量名
    ensureEnvFile(rootDir, userConfig);

    console.log('');
    console.log('✓ FSCA project initialized successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Put secrets in .env (FSCA_PRIVATE_KEY, optional FSCA_RPC_URL)');
    console.log('  2. Review and update project.json if needed');
    console.log('  3. Start developing your smart contracts!');

  } catch (error) {
    console.error('Failed to initialize FSCA project:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};
