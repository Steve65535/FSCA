const { Wallet, NonceManager } = require("ethers");
const credentials = require("./credentials");

/**
 * 获取 Signer
 * @param {string} privateKey - 私钥
 * @param {Object} provider - Provider 实例
 * @returns {NonceManager} NonceManager-wrapped Wallet 实例
 */
function getSigner(privateKey, provider) {
  credentials.loadEnvFile(process.cwd());
  const resolvedPrivateKey = process.env.Arkheion_PRIVATE_KEY || privateKey;

  if (!resolvedPrivateKey) {
    throw new Error("Private key is required (set Arkheion_PRIVATE_KEY or account.privateKey)");
  }
  return new NonceManager(new Wallet(resolvedPrivateKey, provider));
}

module.exports = { getSigner };

