// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../core/lib/normaltemplate.sol";

// =============================================================================
// CBS 最佳实践：纯逻辑合约（风控）
//
// 设计原则：
//   1. 不含任何 mapping(address => ...)，用户状态全部存在 AccountStorage
//   2. 只持有"策略参数"（非用户数据），如单笔上限、是否暂停
//   3. 策略变更通过热升级实现（部署 V2 替换，AccountStorage 数据无损）
//   4. 通过 passiveModuleVerification 确保只有 TradeEngine 能调用校验接口
//
// 依赖关系：
//   passivePod[2] = TradeEngine（当前版本）
// =============================================================================

contract RiskGuardV1 is normalTemplate {

    uint32 private constant TRADE_ENGINE_ID = 2;

    // 策略参数（非用户数据，升级时可在 V2 构造函数中重新初始化）
    uint256 public maxSingleTransfer = 10_000 ether;
    bool    public paused = false;

    constructor(address _clusterAddress, string memory _name)
        normalTemplate(_clusterAddress, _name)
    {}

    // ===================== 风控校验接口 =====================

    /// @notice 转账前校验（仅 TradeEngine 可调用）
    /// @dev 校验失败时直接 revert，无返回值
    function checkTransfer(
        uint32  /* tokenId */,
        address from,
        address to,
        uint256 amount
    )
        external
        view
        passiveModuleVerification(TRADE_ENGINE_ID)
    {
        require(!paused,             "RiskGuard: system paused");
        require(amount > 0,          "RiskGuard: zero amount");
        require(from != address(0),  "RiskGuard: invalid sender");
        require(to != address(0),    "RiskGuard: invalid recipient");
        require(from != to,          "RiskGuard: self-transfer not allowed");
        require(amount <= maxSingleTransfer, "RiskGuard: exceeds single-tx limit");
    }

    // ===================== 管理接口（onlyCluster）=====================

    function setMaxSingleTransfer(uint256 _max) external onlyCluster {
        require(_max > 0, "RiskGuard: invalid limit");
        maxSingleTransfer = _max;
    }

    function setPaused(bool _paused) external onlyCluster {
        paused = _paused;
    }
}
