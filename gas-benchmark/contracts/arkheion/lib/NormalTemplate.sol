// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./AddressPod.sol";

interface IClusterManager {
    function evokerManager() external view returns (address);
}

contract NormalTemplate {
    using AddressPod for AddressPod.Pod;

    address public immutable clusterAddress;
    uint8 public whetherMounted;
    string public name;
    uint32 public contractId;
    address public proxywalletaddr;

    AddressPod.Pod internal activePod;
    AddressPod.Pod internal passivePod;

    modifier onlyCluster() {
        address evoker = IClusterManager(clusterAddress).evokerManager();
        require(
            msg.sender == clusterAddress || (evoker != address(0) && msg.sender == evoker),
            "Not cluster"
        );
        _;
    }

    modifier notMounted() {
        require(whetherMounted == 0, "Already mounted");
        _;
    }

    constructor(address _cluster, string memory _name) {
        require(_cluster != address(0), "cluster=0");
        clusterAddress = _cluster;
        name = _name;
    }

    function setWhetherMounted(uint8 v) external onlyCluster { whetherMounted = v; }
    function setContractId(uint32 id) external onlyCluster notMounted { contractId = id; }
    function setProxyWalletAddr(address a) external onlyCluster { proxywalletaddr = a; }

    function addActiveModule(uint32 id, address addr) external onlyCluster notMounted {
        activePod.add(id, addr);
    }
    function addPassiveModule(uint32 id, address addr) external onlyCluster notMounted {
        passivePod.add(id, addr);
    }
    function removeActiveModule(uint32 id) external onlyCluster notMounted {
        activePod.remove(id);
    }
    function removePassiveModule(uint32 id) external onlyCluster notMounted {
        passivePod.remove(id);
    }

    modifier activeModuleVerification(uint32 id) {
        activePod.verifyModule(id, msg.sender);
        _;
    }
    modifier passiveModuleVerification(uint32 id) {
        passivePod.verifyModule(id, msg.sender);
        _;
    }
    modifier onlyActiveMember() {
        activePod.verifyMember(msg.sender);
        _;
    }

    function getActiveModuleAddress(uint32 id) public view returns (address) {
        return activePod.get(id);
    }
    function getPassiveModuleAddress(uint32 id) public view returns (address) {
        return passivePod.get(id);
    }
    function getAllActiveModules() external view returns (AddressPod.Module[] memory) {
        return activePod.getAllModules();
    }
    function getAllPassiveModules() external view returns (AddressPod.Module[] memory) {
        return passivePod.getAllModules();
    }
    function getAllActiveAddresses() external view returns (address[] memory) {
        return activePod.getAllAddresses();
    }
    function getAllPassiveAddresses() external view returns (address[] memory) {
        return passivePod.getAllAddresses();
    }
}
