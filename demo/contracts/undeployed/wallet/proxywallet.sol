// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;
import "../lib/normaltemplate.sol";
import "../lib/noReentryGuard.sol";

/**
 * @title ProxyWallet
 * @notice A shared proxy wallet that manages EOA permissions and forwards calls to the Gate.
 * @dev Inherits NormalTemplate for Cluster integration.
 */
contract ProxyWallet is normalTemplate, NoReentryGuard {
    
    // EOA Address => Permission Level (0 = Admin/High, >0 = Lower)
    // Stored as Level + 1 to distinguish 0 (unregistered).
    mapping(address => uint256) public _userRights;
    mapping(address=>uint8) public _rightmanagers;
    address[] public all1s;
    /* -------------------------------------------------------------------------- */
    /*                                Constructor                                 */
    /* -------------------------------------------------------------------------- */

    constructor(address _clusterAddress) normalTemplate(_clusterAddress, "ProxyWallet") {
        // No fixed gateAddress anymore. Gates are added via ClusterManager -> mountNode
    }

    /* -------------------------------------------------------------------------- */
    /*                            Permission Management                           */
    /* -------------------------------------------------------------------------- */

    /**
     * @notice Sets the permission level for a user.
     * @dev Implements hierarchical control:
     *      - ClusterManager can set any level.
     *      - Existing users can only set levels strictly lower (larger value) than their own.
     */
    modifier onlyOperator{
        require(msg.sender==clusterAddress||_rightmanagers[msg.sender]==1,"not qualified");
        _;
    }
    function setRightManager(address addr,uint8 right) external onlyCluster{
        require(right==1||right==0);
        _userRights[addr]=right;
        if(right==1){
            all1s.push(addr);
        }
        else if(right==0){
            for(uint256 i=0;i<all1s.length;i++){
                if(all1s[i]==addr){
                    all1s[i] = all1s[all1s.length - 1];
                    all1s.pop();
                    break;
                }
            }
        }
    }

    function setUserRight(address user, uint256 level) external onlyOperator{
        // 1. ClusterManager Logic (God Mode)
        if (msg.sender == clusterAddress) {
            _userRights[user] = level + 1;
            return;
        }

        // 2. Hierarchical Logic (Parent -> Child)
        uint256 senderStored = _userRights[msg.sender];
        require(senderStored > 0, "Access Denied: Sender not registered");
        
        uint256 senderLevel = senderStored - 1;
        require(level > senderLevel, "Access Denied: Cannot grant equal or higher privilege");

        _userRights[user] = level + 1;
    }

    function getUserRight(address user) public view returns (bool exists, uint256 level) {
        uint256 stored = _userRights[user];
        if (stored == 0) return (false, 0);
        return (true, stored - 1);
    }
    /**
     * @notice Emergency function to rescue Native Tokens.
     */
    function withdrawNative(address payable to, uint256 amount) external nonReentrant {
        address root = IClusterManager(clusterAddress).rootAdmin();
        require(msg.sender == root, "Only Root Admin");
        require(to != address(0), "Invalid recipient");

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {}
}

