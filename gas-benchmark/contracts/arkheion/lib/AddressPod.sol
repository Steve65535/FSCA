// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

library AddressPod {
    struct Module {
        uint32 contractId;
        address moduleAddress;
    }
    struct Pod {
        Module[] modules;
        mapping(uint32 => uint256) index;       // contractId => index+1
        mapping(address => uint32) addrIndex;   // addr => contractId
    }

    function add(Pod storage pod, uint32 contractId, address moduleAddress) internal {
        require(pod.index[contractId] == 0, "Module exists");
        pod.modules.push(Module(contractId, moduleAddress));
        pod.index[contractId] = pod.modules.length;
        pod.addrIndex[moduleAddress] = contractId;
    }

    function remove(Pod storage pod, uint32 contractId) internal {
        uint idx = pod.index[contractId];
        require(idx != 0, "Module not exist");
        delete pod.addrIndex[pod.modules[idx - 1].moduleAddress];
        uint lastIdx = pod.modules.length;
        if (idx != lastIdx) {
            Module storage last = pod.modules[lastIdx - 1];
            pod.modules[idx - 1] = last;
            pod.index[last.contractId] = idx;
        }
        pod.modules.pop();
        delete pod.index[contractId];
    }

    function get(Pod storage pod, uint32 contractId) internal view returns (address) {
        uint idx = pod.index[contractId];
        return idx == 0 ? address(0) : pod.modules[idx - 1].moduleAddress;
    }

    function exists(Pod storage pod, uint32 contractId) internal view returns (bool) {
        return pod.index[contractId] != 0;
    }

    function verifyModule(Pod storage pod, uint32 contractId, address sender) internal view {
        uint idx = pod.index[contractId];
        require(idx != 0, "Module does not exist");
        require(pod.modules[idx - 1].moduleAddress == sender, "Access denied");
    }

    function verifyMember(Pod storage pod, address sender) internal view {
        require(pod.addrIndex[sender] != 0, "Not a pod member");
    }

    function getAllAddresses(Pod storage pod) internal view returns (address[] memory) {
        address[] memory addrs = new address[](pod.modules.length);
        for (uint i = 0; i < pod.modules.length; i++) addrs[i] = pod.modules[i].moduleAddress;
        return addrs;
    }

    function getAllModules(Pod storage pod) internal view returns (Module[] memory) {
        return pod.modules;
    }
}
