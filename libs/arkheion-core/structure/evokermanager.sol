// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../lib/normaltemplate.sol";
import "../lib/noReentryGuard.sol";
import "../lib/addressPod.sol";

contract EvokerManager is normalTemplate, NoReentryGuard {

    // ===========================
    // Graph: adjacency list
    // ===========================
    
    // 邻接表 from -> [to1, to2 ...]
    mapping(address => address[]) public adjList;

    // mounted[from][to] = true/false
    mapping(address => mapping(address => bool)) public mounted;

    // 图中所有节点（合约地址）
    address[] public nodes;
    mapping(address => bool) public exists;

    event NodeMounted(address indexed from, address indexed to);
    event NodeUnmounted(address indexed from, address indexed to);

    constructor(address _clusterAddress) normalTemplate(_clusterAddress, "EvokerManager") {}


    // ===========================
    // Internal helper
    // ===========================
    function _registerNode(address a) internal {
        if (!exists[a]) {
            exists[a] = true;
            nodes.push(a);
        }
    }
    function _unregisterNode(address a) internal {
        if (!exists[a]) return; // 节点不存在，直接返回

        exists[a] = false; // 更新映射

        // 从 nodes 数组移除（swap-pop）
        uint len = nodes.length;
        for (uint i = 0; i < len; i++) {
            if (nodes[i] == a) {
                nodes[i] = nodes[len - 1]; // 用最后一个元素替换
                nodes.pop();               // 删除最后一个元素
                break;
            }
        }
    }

    function _addEdge(address from, address to) internal {
        if (!mounted[from][to]) {
            mounted[from][to] = true;
            adjList[from].push(to);
            emit NodeMounted(from, to);
        }
    }

    function _removeEdge(address from, address to) internal {
        if (!mounted[from][to]) return;

        mounted[from][to] = false;

        // 从邻接表移除（swap-pop）
        address[] storage arr = adjList[from];
        uint256 len = arr.length;
        for (uint256 i = 0; i < len; i++) {
            if (arr[i] == to) {
                arr[i] = arr[len - 1];
                arr.pop();
                break;
            }
        }

        emit NodeUnmounted(from, to);
    }

    // ===========================
    // Mount
    // ===========================
    function mount(address newContract)
        external
        onlyCluster
        nonReentrant
    {
        require(newContract != address(0), "Invalid address");

        normalTemplate nc = normalTemplate(newContract);
        _registerNode(newContract);

        // 获取 active / passive
        address[] memory actives = nc.getAllActiveAddresses();
        address[] memory passives = nc.getAllPassiveAddresses();

        // === active: newContract -> target ===
        for (uint256 i = 0; i < actives.length; i++) {
            address targetAddr = actives[i];
            if (targetAddr == address(0)) continue;

            if (!mounted[newContract][targetAddr]) {
                normalTemplate target = normalTemplate(targetAddr);
                target.setWhetherMounted(0);
                target.addPassiveModule(nc.contractId(), newContract);
                target.setWhetherMounted(1);
                _addEdge(newContract, targetAddr);
            }
        }

        // === passive: target -> newContract ===
        for (uint256 i = 0; i < passives.length; i++) {
            address targetAddr = passives[i];
            if (targetAddr == address(0)) continue;

            _registerNode(targetAddr);

            if (!mounted[targetAddr][newContract]) {
                normalTemplate target = normalTemplate(targetAddr);
                target.setWhetherMounted(0);
                target.addActiveModule(nc.contractId(), newContract);
                target.setWhetherMounted(1);
                _addEdge(targetAddr, newContract);
            }
        }
        nc.setWhetherMounted(1);
    }
    //pod=1 挂载soueceaddr的主动 反之则反
    function mountSingle(address sourceAddr,address targetAddr,uint8 pod) external onlyCluster{
        normalTemplate source=normalTemplate(sourceAddr);
        normalTemplate target=normalTemplate(targetAddr);
        source.setWhetherMounted(0);
        target.setWhetherMounted(0);//unlock
        if(pod==1){
            source.addActiveModule(target.contractId(),targetAddr);
            target.addPassiveModule(source.contractId(), sourceAddr);
        }
        else if(pod==0){
            source.addPassiveModule(target.contractId(), targetAddr);
            target.addActiveModule(source.contractId(), sourceAddr);
        }
        _addEdge(sourceAddr, targetAddr);
        _registerNode(sourceAddr);
        _registerNode(targetAddr);
        source.setWhetherMounted(1);
        target.setWhetherMounted(1);
    }
    function unmountSingle(address sourceAddr, address targetAddr, uint8 pod) external onlyCluster {
        normalTemplate source = normalTemplate(sourceAddr);
        normalTemplate target = normalTemplate(targetAddr);

        source.setWhetherMounted(0);
        target.setWhetherMounted(0);

        if (pod == 1) {
            source.removeActiveModule(target.contractId());
            target.removePassiveModule(source.contractId());
        } 
        else if (pod == 0) {
            source.removePassiveModule(target.contractId());
            target.removeActiveModule(source.contractId());
        }

        source.setWhetherMounted(1);
        target.setWhetherMounted(1);

        _removeEdge(sourceAddr, targetAddr);
    }
    // ===========================
    // Unmount
    // ===========================
    function unmount(address targetAddr)
        external
        onlyCluster
        nonReentrant
    {
        
        normalTemplate target = normalTemplate(targetAddr);
        target.setWhetherMounted(0);
        // 遍历所有节点，解锁邻居后清除边
        address[] memory active=target.getAllActiveAddresses();
        address[] memory passive=target.getAllPassiveAddresses();
        for(uint i=0;i<active.length;i++){
            normalTemplate _active=normalTemplate(active[i]);
            _active.setWhetherMounted(0);
            _active.removePassiveModule(target.contractId());
            _active.setWhetherMounted(1);
            _removeEdge(targetAddr, active[i]);
        }
        for(uint i=0;i<passive.length;i++){
            normalTemplate _passive=normalTemplate(passive[i]);
            _passive.setWhetherMounted(0);
            _passive.removeActiveModule(target.contractId());
            _passive.setWhetherMounted(1);
            _removeEdge(passive[i], targetAddr);
        }


        _unregisterNode(targetAddr);

    }

}