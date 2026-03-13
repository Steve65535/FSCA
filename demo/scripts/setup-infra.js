/**
 * Demo 基础设施部署（Hardhat script，避免 nonce 同步问题）
 *
 * 用法: npx hardhat run scripts/setup-infra.js --network localhost
 *
 * 部署 ClusterManager + EvokerManager，写入 project.json
 * 之后的业务合约全部通过 fsca CLI 命令操作
 */

'use strict';

const hre = require('hardhat');
const { ethers } = hre;
const fs   = require('fs');
const path = require('path');

const DEMO_DIR = path.join(__dirname, '..');

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log('Deployer:', deployer.address);

    // 1. ClusterManager
    const ClusterManager = await ethers.getContractFactory('ClusterManager');
    const cluster = await ClusterManager.deploy(deployer.address);
    await cluster.waitForDeployment();
    const clusterAddr = await cluster.getAddress();
    console.log('ClusterManager:', clusterAddr);

    // 2. EvokerManager
    const EvokerManager = await ethers.getContractFactory('EvokerManager');
    const evoker = await EvokerManager.deploy(clusterAddr);
    await evoker.waitForDeployment();
    const evokerAddr = await evoker.getAddress();
    console.log('EvokerManager:', evokerAddr);

    // 3. 绑定
    await (await cluster.setEvokerManager(evokerAddr)).wait();
    console.log('Linked');

    // 4. 写 project.json（保留 network / account，只更新 fsca 字段）
    const config = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'project.json'), 'utf-8'));
    config.fsca = {
        clusterAddress: clusterAddr,
        evokerManager:  evokerAddr,
    };
    fs.writeFileSync(path.join(DEMO_DIR, 'project.json'), JSON.stringify(config, null, 2));
    console.log('project.json updated');

    console.log('Setup complete. ClusterManager ABI at: artifacts/contracts/core/structure/clustermanager.sol/');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
