// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./lib/normaltemplate.sol";
import "./lib/noReentryGuard.sol";
import "./interfaces/IAccountStorage.sol";
import "./interfaces/IRiskGuard.sol";

// =============================================================================
// 热升级演示：TradeEngineV2
//
// 相比 V1 新增功能：
//   1. 转账收取手续费（feeRate，basis points，默认 100 = 1%）
//   2. 手续费入账到 feeRecipient（同样写入 AccountStorage，数据不出集群）
//   3. 用户累计交易量记录到 AccountStorage._userData[user][VOLUME_KEY]
//   4. 所有跨合约写操作使用 nonReentrant 防护（安全最佳实践）
//
// 升级时 AccountStorage 中的所有余额数据完全保留，零迁移
// AccountStorage.passivePod[2] 由 EvokerManager 自动更新为 V2 地址
//
// Pod 拓扑（与 V1 完全相同，热升级时复制 V1 pods）：
//   activePod[1] = AccountStorage
//   activePod[3] = RiskGuardV1（风控版本不变）
// =============================================================================

contract TradeEngineV2 is normalTemplate, NoReentryGuard {

    uint32 private constant ACCOUNT_STORAGE_ID = 1;
    uint32 private constant RISK_GUARD_ID       = 3;

    // AccountStorage 中存交易量的 key
    bytes32 public constant VOLUME_KEY = keccak256("totalVolume");

    // 手续费配置（策略参数，非用户状态）
    uint256 public feeRate = 100;        // basis points: 100 = 1%
    address public immutable feeRecipient;

    event Deposit (address indexed user, uint32 tokenId, uint256 amount);
    event Withdraw(address indexed user, uint32 tokenId, uint256 amount);
    event Transfer(
        address indexed from,
        address indexed to,
        uint32 tokenId,
        uint256 gross,
        uint256 fee,
        uint256 net
    );

    constructor(address _clusterAddress)
        normalTemplate(_clusterAddress, "TradeEngineV2")
    {
        feeRecipient = msg.sender;
    }

    // ======================== 内部辅助 ========================

    function _storage() internal view returns (IAccountStorage) {
        address addr = getActiveModuleAddress(ACCOUNT_STORAGE_ID);
        require(addr != address(0), "TradeEngineV2: AccountStorage not connected");
        return IAccountStorage(addr);
    }

    function _risk() internal view returns (IRiskGuard) {
        address addr = getActiveModuleAddress(RISK_GUARD_ID);
        require(addr != address(0), "TradeEngineV2: RiskGuard not connected");
        return IRiskGuard(addr);
    }

    // ======================== 用户接口 ========================

    /// @notice 充值（与 V1 相同，充值不收费）
    function deposit(uint32 tokenId, uint256 amount) external nonReentrant {
        require(amount > 0, "TradeEngineV2: zero amount");
        IAccountStorage store = _storage();
        uint256 current = store.getBalance(tokenId, msg.sender);
        store.setBalance(tokenId, msg.sender, current + amount);
        emit Deposit(msg.sender, tokenId, amount);
    }

    /// @notice 提款（与 V1 相同，提款不收费）
    function withdraw(uint32 tokenId, uint256 amount) external nonReentrant {
        require(amount > 0, "TradeEngineV2: zero amount");
        IAccountStorage store = _storage();
        uint256 current = store.getBalance(tokenId, msg.sender);
        require(current >= amount, "TradeEngineV2: insufficient balance");
        store.setBalance(tokenId, msg.sender, current - amount);
        emit Withdraw(msg.sender, tokenId, amount);
    }

    /// @notice 转账（新增：手续费 + 交易量统计）
    function transfer(uint32 tokenId, address to, uint256 amount) external nonReentrant {
        _risk().checkTransfer(tokenId, msg.sender, to, amount);

        IAccountStorage store = _storage();

        uint256 fromBal = store.getBalance(tokenId, msg.sender);
        require(fromBal >= amount, "TradeEngineV2: insufficient balance");

        // 手续费拆分
        uint256 fee = (amount * feeRate) / 10_000;
        uint256 net = amount - fee;

        // 更新账本
        store.setBalance(tokenId, msg.sender, fromBal - amount);
        store.setBalance(tokenId, to, store.getBalance(tokenId, to) + net);

        // 手续费入账（也写 AccountStorage，数据不出集群）
        if (fee > 0) {
            store.setBalance(tokenId, feeRecipient,
                store.getBalance(tokenId, feeRecipient) + fee);
        }

        // 累计交易量统计（存 userData，V1 没有此数据，V2 从 0 起始统计）
        uint256 vol = store.getUserData(msg.sender, VOLUME_KEY);
        store.setUserData(msg.sender, VOLUME_KEY, vol + amount);

        emit Transfer(msg.sender, to, tokenId, amount, fee, net);
    }

    // ======================== 查询接口 ========================

    function getBalance(uint32 tokenId, address user) external view returns (uint256) {
        return _storage().getBalance(tokenId, user);
    }

    function getTotalVolume(address user) external view returns (uint256) {
        return _storage().getUserData(user, VOLUME_KEY);
    }

    // ======================== 管理接口 ========================

    function setFeeRate(uint256 _rate) external onlyCluster {
        require(_rate <= 1000, "TradeEngineV2: fee rate too high (max 10%)");
        feeRate = _rate;
    }
}
