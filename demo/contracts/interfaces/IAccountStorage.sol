// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @notice AccountStorage 对外接口
/// 逻辑合约通过此接口访问账本数据，无需感知存储实现细节
interface IAccountStorage {
    // 代币余额
    function getBalance(uint32 tokenId, address user) external view returns (uint256);
    function setBalance(uint32 tokenId, address user, uint256 amount) external;

    // 用户扩展数据（通用 key-value）
    function getUserData(address user, bytes32 key) external view returns (uint256);
    function setUserData(address user, bytes32 key, uint256 value) external;
}
