/**
 * 初始化 Arkheion 项目
 */

const fs = require('fs');
const path = require('path');

module.exports = async function init({ rootDir }) {
  console.log('Initializing Arkheion project...');

  const arkheionDir = path.join(rootDir, '.arkheion');
  const contractsDir = path.join(rootDir, 'contracts');
  const configFile = path.join(arkheionDir, 'config.json');

  // 创建 .arkheion 目录
  if (!fs.existsSync(arkheionDir)) {
    fs.mkdirSync(arkheionDir, { recursive: true });
    console.log('Created .arkheion directory');
  }

  // 创建 contracts 目录
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
    console.log('Created contracts directory');
  }

  // 创建默认配置文件
  if (!fs.existsSync(configFile)) {
    const defaultConfig = {
      network: 'mainnet',
      rpcUrl: '',
      chainId: 1
    };
    fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
    console.log('Created config.json');
  }

  console.log('Arkheion project initialized successfully!');
};
