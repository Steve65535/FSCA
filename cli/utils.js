const fs = require('fs');
const path = require('path');

/**
 * 查找 Arkheion 项目根目录
 * @param {string} startDir - 起始目录
 * @returns {string|null} 项目根目录路径或 null
 */
function resolveArkheionRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.arkheion'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * 加载配置文件
 * @param {string} rootDir - 项目根目录
 * @returns {Object|null} 配置对象
 */
function loadConfig(rootDir) {
  const configPath = path.join(rootDir, '.arkheion', 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return null;
}

module.exports = { resolveArkheionRoot, loadConfig };