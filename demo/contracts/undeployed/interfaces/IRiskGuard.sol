// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @notice RiskGuard 对外接口
/// 转账前由 TradeEngine 调用，校验失败时 revert
interface IRiskGuard {
    function checkTransfer(
        uint32 tokenId,
        address from,
        address to,
        uint256 amount
    ) external view;
}
