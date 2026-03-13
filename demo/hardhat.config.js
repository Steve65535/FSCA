require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.21",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        // 本地测试网（npx hardhat node）
        localhost: {
            url: "http://127.0.0.1:8545",
        },
        // Sei 私有链示例（填入实际 RPC 和私钥后使用）
        sei_private: {
            url: process.env.SEI_RPC_URL || "http://localhost:8545",
            accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
            chainId: parseInt(process.env.SEI_CHAIN_ID || "1329"),
        },
    },
    // 合约大小检查（EIP-170 = 24KB，Sei 私有链 = 256KB）
    paths: {
        sources  : "./contracts",
        scripts  : "./scripts",
        artifacts: "./artifacts",
        cache    : "./cache",
    },
};
