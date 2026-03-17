const { JsonRpcProvider } = require("ethers");
const credentials = require("../wallet/credentials");

/**
 * 获取 Provider
 * @param {string} rpcUrl - RPC URL
 * @returns {JsonRpcProvider} Provider 实例
 */
function getProvider(rpcUrl) {
  credentials.loadEnvFile(process.cwd());
  const resolvedRpcUrl = process.env.FSCA_RPC_URL || rpcUrl;

  if (!resolvedRpcUrl) {
    throw new Error("RPC URL is required");
  }
  return new JsonRpcProvider(resolvedRpcUrl);
}

module.exports = { getProvider };
