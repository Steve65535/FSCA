// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../core/lib/normaltemplate.sol";
import "../core/lib/noReentryGuard.sol";
import "../interfaces/IAccountStorage.sol";
import "../interfaces/IRiskGuard.sol";

// =============================================================================
// CBS 最佳实践：纯逻辑合约（交易引擎 V1）
//
// 设计原则：
//   1. 不含任何 mapping(address => ...)
//      所有用户状态均通过 activePod 读写 AccountStorage
//   2. 运行时通过 getActiveModuleAddress(id) 动态获取依赖合约地址
//      不需要硬编码地址，热升级后地址自动由 EvokerManager 更新
//   3. 本合约可完整热升级（V2 替换 V1），AccountStorage 数据零迁移
//   4. 所有跨合约写操作使用 nonReentrant 防护（安全最佳实践）
//
// Pod 拓扑（activePod）：
//   activePod[1] = AccountStorage
//   activePod[3] = RiskGuardV1
// =============================================================================

contract TradeEngineV1 is normalTemplate, NoReentryGuard {

    uint32 private constant ACCOUNT_STORAGE_ID = 1;
    uint32 private constant RISK_GUARD_ID       = 3;

    event Deposit (address indexed user, uint32 tokenId, uint256 amount);
    event Withdraw(address indexed user, uint32 tokenId, uint256 amount);
    event Transfer(address indexed from, address indexed to, uint32 tokenId, uint256 amount);

    constructor(address _clusterAddress, string memory _name)
        normalTemplate(_clusterAddress, _name)
    {}

    // ======================== 内部辅助 ========================

    /// @notice 运行时从 activePod 获取 AccountStorage 地址
    function _storage() internal view returns (IAccountStorage) {
        address addr = getActiveModuleAddress(ACCOUNT_STORAGE_ID);
        require(addr != address(0), "TradeEngineV1: AccountStorage not connected");
        return IAccountStorage(addr);
    }

    /// @notice 运行时从 activePod 获取 RiskGuard 地址
    function _risk() internal view returns (IRiskGuard) {
        address addr = getActiveModuleAddress(RISK_GUARD_ID);
        require(addr != address(0), "TradeEngineV1: RiskGuard not connected");
        return IRiskGuard(addr);
    }

    // ======================== 用户接口 ========================

    /// @notice 充值（内部记账，不涉及实际资产转移）
    function deposit(uint32 tokenId, uint256 amount) external nonReentrant {
        require(amount > 0, "TradeEngineV1: zero amount");
        IAccountStorage store = _storage();
        uint256 current = store.getBalance(tokenId, msg.sender);
        store.setBalance(tokenId, msg.sender, current + amount);
        emit Deposit(msg.sender, tokenId, amount);
    }

    /// @notice 提款
    function withdraw(uint32 tokenId, uint256 amount) external nonReentrant {
        require(amount > 0, "TradeEngineV1: zero amount");
        IAccountStorage store = _storage();
        uint256 current = store.getBalance(tokenId, msg.sender);
        require(current >= amount, "TradeEngineV1: insufficient balance");
        store.setBalance(tokenId, msg.sender, current - amount);
        emit Withdraw(msg.sender, tokenId, amount);
    }

    /// @notice 转账（先走风控，再更新账本）
    function transfer(uint32 tokenId, address to, uint256 amount) external nonReentrant {
        // 风控校验（调用 RiskGuardV1，passivePod 验证此合约是授权方）
        _risk().checkTransfer(tokenId, msg.sender, to, amount);

        IAccountStorage store = _storage();
        uint256 fromBal = store.getBalance(tokenId, msg.sender);
        require(fromBal >= amount, "TradeEngineV1: insufficient balance");

        uint256 toBal = store.getBalance(tokenId, to);
        store.setBalance(tokenId, msg.sender, fromBal - amount);
        store.setBalance(tokenId, to, toBal + amount);

        emit Transfer(msg.sender, to, tokenId, amount);
    }

    // ======================== 查询接口 ========================

    function getBalance(uint32 tokenId, address user) external view returns (uint256) {
        return _storage().getBalance(tokenId, user);
    }
}
