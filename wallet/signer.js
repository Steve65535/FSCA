const { Wallet } = require("ethers");
const credentials = require("./credentials");

/**
 * 获取 Signer
 * @param {string} privateKey - 私钥
 * @param {Object} provider - Provider 实例
 * @returns {Wallet} Wallet 实例
 */
function getSigner(privateKey, provider) {
  credentials.loadEnvFile(process.cwd());
  const resolvedPrivateKey = process.env.FSCA_PRIVATE_KEY || privateKey;

  if (!resolvedPrivateKey) {
    throw new Error("Private key is required (set FSCA_PRIVATE_KEY or account.privateKey)");
  }
  return new Wallet(resolvedPrivateKey, provider);
}

module.exports = { getSigner };

