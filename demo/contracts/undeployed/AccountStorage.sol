// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../core/lib/normaltemplate.sol";

// =============================================================================
// CBS 最佳实践：纯存储合约
//
// 设计原则：
//   1. 只使用双重 mapping 存储用户数据
//   2. 只暴露 get / set 两类接口，不含任何业务逻辑
//   3. 写入函数通过 passiveModuleVerification 限制只有授权逻辑合约才可调用
//   4. 存储合约本身永远不需要热升级 —— 数据结构不变，只升级逻辑层
//
// 依赖关系（passivePod）：
//   AccountStorage.passivePod[2] = TradeEngine（当前版本地址）
//   热升级 TradeEngine 后，passivePod[2] 自动更新为新地址，存储无感知
// =============================================================================

contract AccountStorage is normalTemplate {

    // =========================================================================
    // 授权写入方 ID 列表
    //
    // 数据层应对多个逻辑模块开放写入（最佳实践 §11.2 / §11.4）
    // 通过 passiveModuleVerification 校验 msg.sender 是否在 passivePod 中
    //
    // 当前授权：
    //   ID=2  TradeEngine（当前版本，热升级后地址自动更新）
    //
    // 扩展示例（未来新增 LendingEngine 时）：
    //   ID=4  LendingEngine — 通过 fsca cluster link 添加 passivePod[4]
    //   然后在 setBalance/setUserData 上增加 passiveModuleVerification(4) 的重载
    //   或使用下方的 _verifyWriter modifier 统一校验
    // =========================================================================

    uint32 private constant TRADE_ENGINE_ID = 2;

    // ==========================================================================
    // 双重 mapping 存储表 1：代币余额
    //   key1: tokenId（资产类型，0=ETH单位，1=USDC单位，以此类推）
    //   key2: user（用户地址）
    //   value: 余额（18位精度整数）
    // ==========================================================================
    mapping(uint32 => mapping(address => uint256)) private _balances;

    // ==========================================================================
    // 双重 mapping 存储表 2：用户扩展数据
    //   key1: user（用户地址）
    //   key2: dataKey（业务定义的 bytes32 键名，如 keccak256("totalVolume")）
    //   value: 通用 uint256 数值
    //
    // 逻辑合约所有需要持久化的"非余额"用户数据都存这里
    // 这样即使逻辑合约升级，历史数据仍然可读
    // ==========================================================================
    mapping(address => mapping(bytes32 => uint256)) private _userData;

    constructor(address _clusterAddress, string memory _name)
        normalTemplate(_clusterAddress, _name)
    {}

    // ======================== 余额 get / set ========================

    /// @notice 读取用户某资产余额（任何人可调用）
    function getBalance(uint32 tokenId, address user)
        external view returns (uint256)
    {
        return _balances[tokenId][user];
    }

    /// @notice 更新用户余额（仅 passivePod 中授权的逻辑合约可调用）
    function setBalance(uint32 tokenId, address user, uint256 amount)
        external
        passiveModuleVerification(TRADE_ENGINE_ID)
    {
        _balances[tokenId][user] = amount;
    }

    // ======================== 用户数据 get / set ========================

    /// @notice 读取用户扩展数据（任何人可调用）
    function getUserData(address user, bytes32 key)
        external view returns (uint256)
    {
        return _userData[user][key];
    }

    /// @notice 写入用户扩展数据（仅 passivePod 中授权的逻辑合约可调用）
    function setUserData(address user, bytes32 key, uint256 value)
        external
        passiveModuleVerification(TRADE_ENGINE_ID)
    {
        _userData[user][key] = value;
    }
}
