// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

library AddressPod {
    /// @notice 模块对象
    struct Module {
        uint32 contractId;
        address moduleAddress;
    }

    /// @notice Pod 对象，存储模块数组 + name=>index 映射
    struct Pod {
        Module[] modules;              // 顺序存储模块，方便遍历
        mapping(uint32 => uint256) index; // name => index+1, 0 表示不存在
    }

    /* -------------------------------------------------------------------------- */
    /*                                增删改查操作                                  */
    /* -------------------------------------------------------------------------- */

    /// @notice 添加模块
    function add(Pod storage pod, uint32 contractId, address moduleAddress) internal {
        require(pod.index[contractId] == 0, "Module exists");
        pod.modules.push(Module(contractId, moduleAddress));
        pod.index[contractId] = pod.modules.length; // index+1
    }

    /// @notice 更新模块地址
    function update(Pod storage pod, uint32 contractId, address moduleAddress) internal {
        uint idx = pod.index[contractId];
        require(idx != 0, "Module not exist");
        pod.modules[idx - 1].moduleAddress = moduleAddress;
    }

    /// @notice 删除模块
    function remove(Pod storage pod, uint32 contractId) internal {
        uint idx = pod.index[contractId];
        require(idx != 0, "Module not exist");

        uint lastIdx = pod.modules.length;
        if (idx != lastIdx) {
            // 用最后一个模块覆盖删除模块
            Module storage lastMod = pod.modules[lastIdx - 1];
            pod.modules[idx - 1] = lastMod;
            pod.index[lastMod.contractId] = idx;
        }

        pod.modules.pop();
        delete pod.index[contractId];
    }

    /// @notice 获取模块地址
    function get(Pod storage pod, uint32 contractId) internal view returns (address) {
        uint idx = pod.index[contractId];
        return idx == 0 ? address(0) : pod.modules[idx - 1].moduleAddress;
    }

    /// @notice 检查模块是否存在
    function exists(Pod storage pod, uint32 contractId) internal view returns (bool) {
        return pod.index[contractId] != 0;
    }

    /// @notice 验证模块权限
    function verifyModule(Pod storage pod, uint32 contractId, address sender) internal view {
        uint idx = pod.index[contractId];
        require(idx != 0, "Module does not exist");
        require(pod.modules[idx - 1].moduleAddress == sender, "Access denied: Module mismatch");
        require(sender != address(0), "Access denied: Zero address");
    }

    /* -------------------------------------------------------------------------- */
    /*                               遍历和查询函数                                 */
    /* -------------------------------------------------------------------------- */

    /// @notice 获取 Pod 中所有模块地址
    function getAllAddresses(Pod storage pod) internal view returns (address[] memory) {
        address[] memory addrs = new address[](pod.modules.length);
        for (uint i = 0; i < pod.modules.length; i++) {
            addrs[i] = pod.modules[i].moduleAddress;
        }
        return addrs;
    }

    /// @notice 获取 Pod 中所有模块对象（name + address）
    function getAllModules(Pod storage pod) internal view returns (Module[] memory) {
        return pod.modules;
    }
    
}