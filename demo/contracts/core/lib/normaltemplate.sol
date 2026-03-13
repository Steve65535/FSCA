// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./addressPod.sol";

interface IProxyWallet {
    function _userRights(address user) external view returns (uint256);
}
interface IClusterManager {
    function evokerManager() external view returns (address);
    function rootAdmin() external view returns (address);
    function rightManager() external view returns (address);
}

contract normalTemplate {

    using AddressPod for AddressPod.Pod;

    /* -------------------------------------------------------------------------- */
    /*                              Cluster Root Pointer                           */
    /* -------------------------------------------------------------------------- */

    /// @notice ClusterManager 地址（不可变）
    address public immutable clusterAddress;
    uint8 public whetherMounted =0;
    string public name;
    uint32 public contractId;
    modifier onlyCluster{
        address evoker = IClusterManager(clusterAddress).evokerManager();
        require(msg.sender == clusterAddress || (evoker != address(0) && msg.sender == evoker), "Not cluster or evoker");
        _;
    }
    address public proxywalletaddr;
    /* -------------------------------------------------------------------------- */
    /*                                   Pods                                     */
    /* -------------------------------------------------------------------------- */

    /// @notice 主动调用 Pod（执行增删改操作）
    AddressPod.Pod internal activePod;

    /// @notice 被动调用 Pod（一般作为确认、回调、同步使用）
    AddressPod.Pod internal passivePod;
    // abiId => contractAddr => 最大权限码
    mapping(uint256 => uint256) public abiRights;
    /* -------------------------------------------------------------------------- */
    /*                               Events                                       */
    /* -------------------------------------------------------------------------- */
    /// @notice 模块状态变化事件
    /// @param podAddr 发生变化的合约地址（Pod 所属合约）
    /// @param contractId 模块名字
    /// @param moduleAddress 模块地址
    /// @param action 操作类型: "Added" | "Updated" | "Removed"
    event ModuleChanged(
        address indexed podAddr,
        uint32 contractId,
        address moduleAddress,
        string action
    );  

    /* -------------------------------------------------------------------------- */
    /*                               Storage Layout                               */
    /* -------------------------------------------------------------------------- */

    constructor(address _clusterAddress,string memory _name) {
        require(_clusterAddress != address(0), "cluster=0");
        clusterAddress = _clusterAddress;
        name= _name;
    }
    function setWhetherMounted(uint8 _whetherMounted) external onlyCluster{
        whetherMounted=_whetherMounted;
    }
    modifier notMounted{
        require(whetherMounted==0,"Module already mounted");
        _;
    }
    /* -------------------------------------------------------------------------- */
    /*                          Pod Registration Interfaces                       */
    /* -------------------------------------------------------------------------- */
    /// @notice 设置 ABI 权限
    function setAbiRight(uint256 abiId, uint256 maxRight) external onlyCluster {
        require(maxRight > 0, "Invalid right code");
        abiRights[abiId] = maxRight;
    }

    /// @notice 删除 ABI 权限
    function removeAbiRight(uint256 abiId) external onlyCluster{
        delete abiRights[abiId];
    }
    function setContractId(uint32 _contractId) external onlyCluster notMounted{
        contractId = _contractId;
    }
    /// @notice 检查调用权限
    modifier checkAbiRight(uint256 abiId){
        require(IProxyWallet(proxywalletaddr)._userRights(msg.sender) <= abiRights[abiId], "Insufficient permission");
        _;
    }

    function addActiveModule(uint32 _contractId, address moduleAddress)
        external
        onlyCluster
        notMounted
    {
        require(moduleAddress != address(0), "Invalid address");

        activePod.add(_contractId, moduleAddress);
        emit ModuleChanged(address(this), _contractId, moduleAddress, "ActiveAdded");
    }
    function setProxyWalletAddr(address proxyAddr) external onlyCluster{
        proxywalletaddr=proxyAddr;
    }


    function addPassiveModule(uint32 _contractId, address moduleAddress)
        external
        onlyCluster
        notMounted
    {
        require(moduleAddress != address(0), "Invalid address");
        passivePod.add(_contractId, moduleAddress);
        emit ModuleChanged(address(this), _contractId, moduleAddress, "PassiveAdded");

    }
    /// @notice 删除 activePod 中的模块
    /// @notice 删除 activePod 中的模块
    function removeActiveModule(uint32 _contractId) external onlyCluster notMounted{
        address moduleAddr = activePod.get(_contractId); // 先获取模块地址
        activePod.remove(_contractId);                   // 再删除
        emit ModuleChanged(address(this), _contractId, moduleAddr, "ActiveRemoved");
    }

    /// @notice 删除 passivePod 中的模块
    function removePassiveModule(uint32 _contractId) external onlyCluster notMounted{
        address moduleAddr = passivePod.get(_contractId); // 先获取模块地址
        passivePod.remove(_contractId);                    // 再删除
        emit ModuleChanged(address(this), _contractId, moduleAddr, "PassiveRemoved");
    }


    /* -------------------------------------------------------------------------- */
    /*                          Verification Modifiers                            */
    /* -------------------------------------------------------------------------- */

    /// @notice 验证主动模块
    modifier activeModuleVerification(uint32 _contractId) {
        activePod.verifyModule(_contractId, msg.sender);
        _;
    }

    /// @notice 验证被动模块
    modifier passiveModuleVerification(uint32 _contractId) {
        passivePod.verifyModule(_contractId, msg.sender);
        _;
    }

    /* -------------------------------------------------------------------------- */
    /*                           Utility / Query Functions                        */
    /* -------------------------------------------------------------------------- */

    /// @notice 获取所有主动模块名字加地址
    function getAllActiveModules() external view returns (AddressPod.Module[] memory) {
        return activePod.getAllModules();
    }
    function getAllActiveAddresses() external view returns (address[] memory) {
        return activePod.getAllAddresses();
    }
    
    /// @notice 获取所有被动模块名字加地址
    function getAllPassiveModules() external view returns (AddressPod.Module[] memory) {
        return passivePod.getAllModules();
    }
    // 与历史接口兼容
    function getAllPassiveAddresses() external view returns (address[] memory) {
        return passivePod.getAllAddresses();
    }
    /// @notice 获取主动模块地址（public：允许子合约内部调用）
    function getActiveModuleAddress(uint32 _contractId) public view returns (address) {
        return activePod.get(_contractId);
    }

    /// @notice 获取被动模块地址（public：允许子合约内部调用）
    function getPassiveModuleAddress(uint32 _contractId) public view returns (address) {
        return passivePod.get(_contractId);
    }

}