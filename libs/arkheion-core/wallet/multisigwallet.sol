// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/**
 * @title MultiSigWallet
 * @notice A standard multi-signature wallet implementation for managing ClusterManager.
 * @dev Supports submit, confirm, execute, and revoke transaction.
 */
contract MultiSigWallet {

    /* -------------------------------------------------------------------------- */
    /*                              Events                                        */
    /* -------------------------------------------------------------------------- */
    event Deposit(address indexed sender, uint256 amount, uint256 balance);
    event SubmitTransaction(
        address indexed owner,
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        bytes data
    );
    event ConfirmTransaction(address indexed owner, uint256 indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint256 indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint256 indexed txIndex);
    event ThresholdChanged(uint256 oldThreshold, uint256 newThreshold);

    /* -------------------------------------------------------------------------- */
    /*                              State Variables                               */
    /* -------------------------------------------------------------------------- */
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public numConfirmationsRequired;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 numConfirmations;
    }

    // txIndex => Transaction
    mapping(uint256 => Transaction) public transactions;
    // txIndex => owner => confirmed
    mapping(uint256 => mapping(address => bool)) public isConfirmed;
    
    uint256 public transactionCount;

    /* -------------------------------------------------------------------------- */
    /*                              Modifiers                                     */
    /* -------------------------------------------------------------------------- */
    modifier onlyOwner() {
        require(isOwner[msg.sender], "not owner");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactionCount, "tx does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "tx already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!isConfirmed[_txIndex][msg.sender], "tx already confirmed");
        _;
    }

    /* -------------------------------------------------------------------------- */
    /*                              Constructor                                   */
    /* -------------------------------------------------------------------------- */
    constructor(address[] memory _owners, uint256 _numConfirmationsRequired) {
        require(_owners.length > 0, "owners required");
        require(
            _numConfirmationsRequired > 0 &&
                _numConfirmationsRequired <= _owners.length,
            "invalid number of required confirmations"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
    }
        /* -------------------------------------------------------------------------- */
    /*                    Governance: Add / Remove Owners                         */
    /* -------------------------------------------------------------------------- */

    function proposeAddOwner(address newOwner, uint256 _value, bytes memory _data)
        external
        onlyOwner
    {
        require(newOwner != address(0), "invalid address");
        require(!isOwner[newOwner], "already owner");

        uint256 txIndex = transactionCount;

        // 新建一笔“添加成员”交易（内部执行 call）
        transactions[txIndex] = Transaction({
            to: address(this),
            value: _value,
            data: abi.encodeWithSignature("addOwner(address)", newOwner),
            executed: false,
            numConfirmations: 0
        });

        transactionCount += 1;

        emit SubmitTransaction(msg.sender, txIndex, address(this), _value, _data);
    }

    function proposeRemoveOwner(address oldOwner, uint256 _value, bytes memory _data)
        external
        onlyOwner
    {
        require(isOwner[oldOwner], "not an owner");

        uint256 txIndex = transactionCount;

        // 新建一笔"移除成员"交易（内部执行 call）
        transactions[txIndex] = Transaction({
            to: address(this),
            value: _value,
            data: abi.encodeWithSignature("removeOwner(address)", oldOwner),
            executed: false,
            numConfirmations: 0
        });

        transactionCount += 1;

        emit SubmitTransaction(msg.sender, txIndex, address(this), _value, _data);
    }

    function proposeChangeThreshold(uint256 newThreshold, uint256 _value, bytes memory _data)
        external
        onlyOwner
    {
        require(
            newThreshold > 0 && newThreshold <= owners.length,
            "invalid threshold"
        );

        uint256 txIndex = transactionCount;

        // 新建一笔"修改通过人数"交易（内部执行 call）
        transactions[txIndex] = Transaction({
            to: address(this),
            value: _value,
            data: abi.encodeWithSignature("changeThreshold(uint256)", newThreshold),
            executed: false,
            numConfirmations: 0
        });

        transactionCount += 1;

        emit SubmitTransaction(msg.sender, txIndex, address(this), _value, _data);
    }


    /* -------------------------------------------------------------------------- */
    /*                    Internal Logic: Execute Member Change                   */
    /* -------------------------------------------------------------------------- */

    function addOwner(address newOwner) public {
        require(msg.sender == address(this), "only wallet can add");
        require(newOwner != address(0), "invalid owner");
        require(!isOwner[newOwner], "already owner");

        owners.push(newOwner);
        isOwner[newOwner] = true;
    }

    function removeOwner(address oldOwner) public {
        require(msg.sender == address(this), "only wallet can remove");
        require(isOwner[oldOwner], "not owner");
        isOwner[oldOwner] = false;

        // 快速删除（无序）
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == oldOwner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }

        // 如果当前 required > 成员数，则自动下调
        if (numConfirmationsRequired > owners.length) {
            uint256 oldThreshold = numConfirmationsRequired;
            numConfirmationsRequired = owners.length;
            emit ThresholdChanged(oldThreshold, numConfirmationsRequired);
        }
    }

    function changeThreshold(uint256 newThreshold) public {
        require(msg.sender == address(this), "only wallet can change threshold");
        require(
            newThreshold > 0 && newThreshold <= owners.length,
            "invalid threshold"
        );

        uint256 oldThreshold = numConfirmationsRequired;
        numConfirmationsRequired = newThreshold;

        emit ThresholdChanged(oldThreshold, newThreshold);
    }
    /* -------------------------------------------------------------------------- */
    /*                              Receive ETH                                   */
    /* -------------------------------------------------------------------------- */
    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    /* -------------------------------------------------------------------------- */
    /*                              Tx Management                                 */
    /* -------------------------------------------------------------------------- */
    
    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) external onlyOwner {
        uint256 txIndex = transactionCount;

        transactions[txIndex] = Transaction({
            to: _to,
            value: _value,
            data: _data,
            executed: false,
            numConfirmations: 0
        });

        transactionCount += 1;

        emit SubmitTransaction(msg.sender, txIndex, _to, _value, _data);
    }

    function confirmTransaction(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];
        transaction.numConfirmations += 1;
        isConfirmed[_txIndex][msg.sender] = true;

        emit ConfirmTransaction(msg.sender, _txIndex);
    }

    function executeTransaction(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        uint256 validConfirmations = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (isConfirmed[_txIndex][owners[i]]) {
                validConfirmations++;
            }
        }
        require(validConfirmations >= numConfirmationsRequired, "cannot execute tx");

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );
        require(success, "tx failed");

        emit ExecuteTransaction(msg.sender, _txIndex);
    }

    function getValidConfirmations(uint256 _txIndex) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (isConfirmed[_txIndex][owners[i]]) count++;
        }
        return count;
    }

    function revokeConfirmation(uint256 _txIndex)
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        require(isConfirmed[_txIndex][msg.sender], "tx not confirmed");

        transaction.numConfirmations -= 1;
        isConfirmed[_txIndex][msg.sender] = false;

        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    /* -------------------------------------------------------------------------- */
    /*                              View Functions                                */
    /* -------------------------------------------------------------------------- */
    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function getTransactionCount() external view returns (uint256) {
        return transactionCount;
    }

    function getTransaction(uint256 _txIndex)
        external
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 validConfirmations
        )
    {
        Transaction storage transaction = transactions[_txIndex];
        uint256 count = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (isConfirmed[_txIndex][owners[i]]) count++;
        }
        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            count
        );
    }
}
