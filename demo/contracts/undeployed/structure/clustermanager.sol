// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;
import "../lib/noReentryGuard.sol";
import "./evokermanager.sol";
    interface IEvokerManager {
        function mount(
            address source
        ) external;

        function unmount(address source) external;
    }

contract ClusterManager is NoReentryGuard{

    /* -------------------------------------------------------------------------- */
    /*                              权限管理                                       */
    /* -------------------------------------------------------------------------- */
    address public immutable rootAdmin;
    struct contractRegistration{
        uint32 contractId;
        string name;
        address contractAddr;
    }
    struct allcontractRegistration{
        uint32 contractId;
        string name;
        address contractAddr;
        uint256 timeStamp;
    }
    contractRegistration[] public contractRegistrations;
    allcontractRegistration[] public allRegistrations;
    mapping(uint32 => uint256) private idToIndex;       // id -> array index + 1
    mapping(string => uint32) private nameToId;         // name -> id
    mapping(address => uint32) private addrToId;   
    ///管理员列表
    struct operatorPod{
        address[] operators;
        mapping(address=>uint256) index;
    }
    operatorPod private OperatorPod;
         // addr -> id
    modifier onlyRoot{
        require(msg.sender == rootAdmin, "Not root");
        _;
    }
    modifier onlyOperator{
        require(msg.sender==rootAdmin||OperatorPod.index[msg.sender]!=0,"Not qualified");
        _;
    }
    /* -------------------------------------------------------------------------- */
    /*                              管理器地址                                     */
    /* -------------------------------------------------------------------------- */
    address public evokerManager;
    address public rightManager;
    function addActivePodBeforeMount(address sourceAddr,address targetAddr,uint32 targetId) external onlyOperator{
        require(addrToId[targetAddr]==targetId,"target id and addr dismatch");
        normalTemplate source=normalTemplate(sourceAddr);
        source.addActiveModule(targetId, targetAddr);
    }
    function addPassivePodBeforeMount(address sourceAddr,address targetAddr,uint32 targetId) external onlyOperator{
        require(addrToId[targetAddr]==targetId,"target id and addr dismatch");
        normalTemplate source=normalTemplate(sourceAddr);
        source.addPassiveModule(targetId,targetAddr);
    }

    function removeActivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external onlyOperator {
        // Explicitly check target address matches ID if needed, though remove logic primarily uses ID
        require(addrToId[targetAddr] == targetId, "target id and addr dismatch");
        normalTemplate source = normalTemplate(sourceAddr);
        source.removeActiveModule(targetId);
    }

    function removePassivePodBeforeMount(address sourceAddr, address targetAddr, uint32 targetId) external onlyOperator {
        require(addrToId[targetAddr] == targetId, "target id and addr dismatch");
        normalTemplate source = normalTemplate(sourceAddr);
        source.removePassiveModule(targetId);
    }
    function addActivePodAfterMount(address sourceAddr, address targetAddr, uint32 targetId) external onlyOperator {
        require(addrToId[targetAddr] == targetId, "target id and addr dismatch");
        uint8 pod = 1;
        EvokerManager(evokerManager).mountSingle(sourceAddr, targetAddr, pod);
    }
    function addPassivePodAfterMount(address sourceAddr,address targetAddr,uint32 targetId) external onlyOperator{
        require(addrToId[targetAddr] ==targetId, "target id and addr dismatch");
        uint8 pod=0;
        EvokerManager(evokerManager).mountSingle(sourceAddr,targetAddr,pod);
    }
    function removeActivePodAfterMount(address sourceAddr,address targetAddr,uint32 targetId) external onlyOperator{
        require(addrToId[targetAddr] ==targetId, "target id and addr dismatch");
        uint8 pod=1;
        EvokerManager(evokerManager).unmountSingle(sourceAddr,targetAddr,pod);
    }
    function removePassivePodAfterMount(address sourceAddr,address targetAddr,uint32 targetId) external onlyOperator{
        require(addrToId[targetAddr] ==targetId, "target id and addr dismatch");
        uint8 pod=0;
        EvokerManager(evokerManager).unmountSingle(sourceAddr,targetAddr,pod);
    }
    
    function registerContract(
        uint32 id,
        string memory name,
        address contractAddr
    ) external onlyOperator{
        require(id != 0, "ID cannot be 0");
        require(idToIndex[id] == 0, "ID exists");
        require(nameToId[name] == 0, "Name exists");
        require(addrToId[contractAddr] == 0, "Address exists");

        contractRegistrations.push(
        contractRegistration({contractId: id, name: name, contractAddr: contractAddr})
    );
        allRegistrations.push(allcontractRegistration({contractId: id, name: name, contractAddr: contractAddr,timeStamp:block.timestamp}));
        
        uint256 idx = contractRegistrations.length; 
        idToIndex[id] = idx;
        nameToId[name] = id;
        addrToId[contractAddr] = id;
        
        // Initialize contract settings before mounting
        normalTemplate target = normalTemplate(contractAddr);
        target.setContractId(id);
        if (rightManager != address(0)) {
            target.setProxyWalletAddr(rightManager);
        }
        
        EvokerManager(evokerManager).mount(contractAddr);
    }
    function getById(uint32 id) public view returns (contractRegistration memory) {
        uint256 idx = idToIndex[id];
        require(idx != 0, "Not found");
        return contractRegistrations[idx - 1];
    }
    function getNameById(uint32 id) public view returns (string memory) {
        return getById(id).name;
    }
    function getAddrById(uint32 id) public view returns (address) {
        return getById(id).contractAddr;
    }
    function setEvokerManager(address _evoker) external onlyOperator {
        require(_evoker != address(0), "Zero address");
        evokerManager = _evoker;
    }

    function setRightManager(address _right) external onlyOperator {
        require(_right != address(0), "Zero address");
        rightManager = _right;
    }
    function deleteContract(uint32 id) external onlyOperator{
        uint256 idx = idToIndex[id];
        require(idx != 0, "Not found");
        uint256 index = idx - 1;

        // Save the item to delete before modifying the array
        contractRegistration memory itemToDelete = contractRegistrations[index];
        uint256 lastIndex = contractRegistrations.length - 1;
        contractRegistration memory lastItem = contractRegistrations[lastIndex];

        if (index != lastIndex) {
            contractRegistrations[index] = lastItem;
            idToIndex[lastItem.contractId] = index + 1;
        }
        contractRegistrations.pop();
        
        // Delete mappings for the item being removed (not lastItem)
        delete idToIndex[id];
        delete nameToId[itemToDelete.name];
        delete addrToId[itemToDelete.contractAddr];
        EvokerManager(evokerManager).unmount(itemToDelete.contractAddr);
    }
        /* -------------------------------------------------------------------------- */
    /*                          OperatorPod 操作接口                               */
    /* -------------------------------------------------------------------------- */

    function addOperator(address operator) external onlyRoot {
        require(operator != address(0), "Zero address");
        require(OperatorPod.index[operator] == 0, "Operator exists");

        OperatorPod.operators.push(operator);
        OperatorPod.index[operator] = OperatorPod.operators.length;
    }

    function removeOperator(address operator) external onlyRoot {
        uint256 idx = OperatorPod.index[operator];
        require(idx != 0, "Operator not found");

        uint256 lastIdx = OperatorPod.operators.length;
        if (idx != lastIdx) {
            address lastOp = OperatorPod.operators[lastIdx - 1];
            OperatorPod.operators[idx - 1] = lastOp;
            OperatorPod.index[lastOp] = idx;
        }

        OperatorPod.operators.pop();
        delete OperatorPod.index[operator];
    }

    function isOperator(address operator) external view returns (bool) {
        return OperatorPod.index[operator] != 0;
    }

    function getAllOperators() external view returns (address[] memory) {
        return OperatorPod.operators;
    }
    /* -------------------------------------------------------------------------- */
    /*                              合约状态管理                                   */
    /* -------------------------------------------------------------------------- */
    enum ContractStatus { None, Active, Inactive, Deleted }

    // 合约地址 => 属性名 => 状态
    mapping(address => mapping(bytes32 => ContractStatus)) internal contractTable;

    /* -------------------------------------------------------------------------- */
    /*                               构造函数                                      */
    /* -------------------------------------------------------------------------- */
    constructor(address _rootAdmin) {
        require(_rootAdmin != address(0), "Zero address");
        rootAdmin = _rootAdmin;
    }

    /* -------------------------------------------------------------------------- */
    /*                            合约状态操作函数                                  */
    /* -------------------------------------------------------------------------- */

    /// 更新合约状态
    function updateContractStatus(address contractAddr, bytes32 key, ContractStatus status) external onlyOperator {
        require(contractTable[contractAddr][key] != ContractStatus.None, "Not exists");
        contractTable[contractAddr][key] = status;
    }

    /// 查询合约状态
    function getContractStatus(address contractAddr, bytes32 key) external view returns (ContractStatus) {
        return contractTable[contractAddr][key];
    }
    function universalCall(
        address contractAddr,
        string calldata abiName,
        bytes calldata data
    ) external onlyOperator nonReentrant returns (bytes memory) {
        require(contractAddr != address(0), "Invalid target contract");

        // 调用目标合约
        (bool success, bytes memory result) = contractAddr.call(data);

        // 事件记录
        emit ContractCalled(msg.sender, contractAddr, abiName, success);

        // 调用失败则回退
        if (!success) {
            assembly {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        return result;
    }

    /// @notice 事件：记录通用调用
    event ContractCalled(
        address indexed caller,
        address indexed target,
        string abiName,
        bool success
    );
}