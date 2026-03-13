/**
 * 列举全局合约集群
 * 通过调用 ClusterManager 的 contractRegistrations 和 allRegistrations
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const readline = require('readline');
const { spawn } = require('child_process');

// 加载 chain 目录下的封装函数
const chainProvider = require('../../../chain/provider');
const walletSigner = require('../../../wallet/signer');

const getProvider = chainProvider.getProvider;
const getSigner = walletSigner.getSigner;

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

  if (!config.fsca || !config.fsca.clusterAddress) {
    throw new Error('ClusterManager address not found in project.json. Please run "fsca cluster init" first.');
  }

  return config;
}

/**
 * 加载 ClusterManager ABI
 * @param {string} rootDir - 项目根目录
 * @returns {any} ABI
 */
function loadClusterManagerABI(rootDir) {
  // 尝试从 artifacts 目录加载
  const artifactPaths = [
    path.join(rootDir, 'artifacts', 'contracts', 'deployed', 'structure', 'ClusterManager.sol', 'ClusterManager.json'),
    path.join(rootDir, 'artifacts', 'contracts', 'undeployed', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
    path.join(rootDir, 'artifacts', 'contracts', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
        path.join(rootDir, 'artifacts', 'contracts', 'core', 'structure', 'clustermanager.sol', 'ClusterManager.json'),
  ];

  for (const artifactPath of artifactPaths) {
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
      return artifact.abi;
    }
  }

  throw new Error('ClusterManager ABI not found. Please compile contracts first with "npx hardhat compile"');
}

/**
 * 获取数组长度
 * @param {ethers.Contract} contract - 合约实例
 * @param {string} arrayName - 数组名称
 * @returns {Promise<number>} 数组长度
 */
async function getArrayLength(contract, arrayName) {
  // 对于 public 数组，Solidity 不会自动生成 length getter
  // 使用二分查找来快速确定长度
  let low = 0;
  let high = 10000; // 设置一个合理的上限
  let length = 0;

  // 使用二分查找快速确定数组长度
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      await contract[arrayName](mid);
      // 如果成功，说明长度至少是 mid + 1
      length = mid + 1;
      low = mid + 1;
    } catch (e) {
      // 如果失败，说明长度小于 mid
      high = mid - 1;
    }
  }

  return length;
}

/**
 * 获取合约注册信息（逐个调用，防止 CPU 压力过大）
 * @param {ethers.Contract} contract - 合约实例
 * @param {string} arrayName - 数组名称
 * @param {number} length - 数组长度
 * @returns {Promise<Array>} 合约注册信息数组
 */
async function getContractRegistrations(contract, arrayName, length) {
  const results = [];

  for (let i = 0; i < length; i++) {
    try {
      const registration = await contract[arrayName](i);

      // 处理返回的数据结构
      if (registration.length >= 3) {
        const contractId = Number(registration[0]);
        const name = registration[1];
        const contractAddr = registration[2];
        const timeStamp = registration.length >= 4 ? Number(registration[3]) : null;

        results.push({
          index: i,
          contractId,
          name,
          address: contractAddr,
          timestamp: timeStamp
        });
      }

      // 每个调用之间歇息 0.02 秒
      if (i < length - 1) {
        await sleep(20);
      }
    } catch (error) {
      console.warn(`Failed to get registration at index ${i}:`, error.message);
    }
  }

  return results;
}

/**
 * 格式化输出合约列表为字符串数组
 * @param {Array} registrations - 合约注册信息数组
 * @param {string} type - 类型（mounted 或 all）
 * @returns {Array<string>} 格式化后的行数组
 */
function formatRegistrations(registrations, type) {
  const lines = [];

  if (registrations.length === 0) {
    lines.push(`No ${type === 'mounted' ? 'mounted' : 'registered'} contracts found.`);
    return lines;
  }

  lines.push('');
  lines.push(`=== ${type === 'mounted' ? 'Mounted' : 'All'} Contracts (${registrations.length}) ===`);
  lines.push('');

  // 表头
  lines.push('Index'.padEnd(8) + 'ID'.padEnd(10) + 'Name'.padEnd(30) + 'Address'.padEnd(44) + (type === 'all' ? 'Timestamp'.padEnd(15) : ''));
  lines.push('-'.repeat(type === 'all' ? 107 : 92));

  // 数据行
  for (const reg of registrations) {
    const index = String(reg.index).padEnd(8);
    const id = String(reg.contractId).padEnd(10);
    const name = (reg.name || '').padEnd(30);
    const address = reg.address.padEnd(44);

    if (type === 'all' && reg.timestamp) {
      const date = new Date(Number(reg.timestamp) * 1000);
      const timestamp = date.toLocaleString().padEnd(15);
      lines.push(index + id + name + address + timestamp);
    } else {
      lines.push(index + id + name + address);
    }
  }

  lines.push('');
  return lines;
}

/**
 * 使用 less 命令分页显示内容
 * @param {string} content - 要显示的内容
 */
function displayWithLess(content) {
  return new Promise((resolve, reject) => {
    const less = spawn('less', ['-R', '-S'], {
      stdio: ['pipe', 'inherit', 'inherit']
    });

    less.stdin.write(content);
    less.stdin.end();

    less.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`less exited with code ${code}`));
      }
    });

    less.on('error', (err) => {
      // 如果 less 不可用，降级到普通输出
      console.log(content);
      resolve();
    });
  });
}

/**
 * 交互式分页显示
 * @param {Array<string>} lines - 要显示的行数组
 * @param {number} pageSize - 每页显示的行数
 */
async function displayWithPager(lines, pageSize = 20) {
  if (lines.length <= pageSize) {
    // 如果内容不多，直接显示
    console.log(lines.join('\n'));
    return;
  }

  // 使用 less 命令进行分页
  const content = lines.join('\n');
  try {
    await displayWithLess(content);
  } catch (error) {
    // 如果 less 不可用，使用简单的交互式分页
    await displayWithSimplePager(lines, pageSize);
  }
}

/**
 * 简单的交互式分页（当 less 不可用时使用）
 * @param {Array<string>} lines - 要显示的行数组
 * @param {number} pageSize - 每页显示的行数
 */
async function displayWithSimplePager(lines, pageSize = 20) {
  let currentPage = 0;
  const totalPages = Math.ceil(lines.length / pageSize);

  // 设置原始模式以捕获按键
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  }

  const displayPage = () => {
    // 清屏
    process.stdout.write('\x1B[2J\x1B[0f');

    const start = currentPage * pageSize;
    const end = Math.min(start + pageSize, lines.length);
    const pageLines = lines.slice(start, end);

    process.stdout.write(pageLines.join('\n'));
    process.stdout.write('\n\n');
    process.stdout.write(`Page ${currentPage + 1} of ${totalPages} (Press Space/Enter for next, B for previous, Q to quit)\n`);
  };

  displayPage();

  return new Promise((resolve) => {
    const onData = (key) => {
      if (key === '\u0003' || key === 'q' || key === 'Q') {
        // Ctrl+C 或 Q 退出
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write('\x1B[2J\x1B[0f');
        process.stdout.write('\n');
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        resolve();
      } else if (key === ' ' || key === '\r' || key === '\n') {
        // 空格或 Enter 键，下一页
        if (currentPage < totalPages - 1) {
          currentPage++;
          displayPage();
        } else {
          // 已经是最后一页，退出
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          process.stdout.write('\x1B[2J\x1B[0f');
          process.stdout.write('\n');
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          resolve();
        }
      } else if (key === 'b' || key === 'B') {
        // B 键，上一页
        if (currentPage > 0) {
          currentPage--;
          displayPage();
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

/**
 * 主函数
 * @param {Object} params - 命令参数
 * @param {string} params.rootDir - 项目根目录
 * @param {Object} params.args - 命令行参数
 * @param {Array} params.subcommands - 子命令路径
 */
module.exports = async function list({ rootDir, args = {}, subcommands = [] }) {
  try {
    // 确定列表类型
    const listType = subcommands[subcommands.length - 1]; // 获取最后一个子命令（mounted 或 all）

    if (listType !== 'mounted' && listType !== 'all') {
      console.error('Invalid list type. Use "mounted" or "all"');
      console.log('Usage: fsca cluster list mounted');
      console.log('       fsca cluster list all');
      process.exit(1);
    }

    // 加载配置
    const config = loadProjectConfig(rootDir);

    // 初始化 Provider 和 Contract
    const provider = getProvider(config.network.rpc);
    const abi = loadClusterManagerABI(rootDir);
    const clusterAddress = config.fsca.clusterAddress;

    const contract = new ethers.Contract(clusterAddress, abi, provider);

    console.log(`Fetching ${listType === 'mounted' ? 'mounted' : 'all'} contracts from ClusterManager...`);
    console.log(`ClusterManager: ${clusterAddress}`);
    console.log('');

    // 确定要查询的数组
    const arrayName = listType === 'mounted' ? 'contractRegistrations' : 'allRegistrations';

    // 获取数组长度
    console.log('Getting array length...');
    const length = await getArrayLength(contract, arrayName);
    console.log(`Found ${length} ${listType === 'mounted' ? 'mounted' : 'registered'} contract(s)`);
    console.log('');

    if (length === 0) {
      displayRegistrations([], listType);
      return;
    }

    // 逐个获取合约信息（防止 CPU 压力过大）
    console.log('Fetching contract details (this may take a while)...');
    const registrations = await getContractRegistrations(contract, arrayName, length);

    // 格式化结果
    const formattedLines = formatRegistrations(registrations, listType);

    // 使用分页显示
    console.log('Opening pager...');
    await displayWithPager(formattedLines, 20);

    console.log('✓ List completed successfully');

  } catch (error) {
    console.error('Failed to list contracts:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

