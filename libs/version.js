/**
 * 显示版本信息
 */

const path = require('path');

module.exports = async function version() {
  const packageJson = require(path.join(__dirname, '../package.json'));
  console.log(`arkheion-cli version ${packageJson.version}`);
};
