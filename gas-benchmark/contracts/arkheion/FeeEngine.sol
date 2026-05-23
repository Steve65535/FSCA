// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./lib/NormalTemplate.sol";

contract FeeEngine is NormalTemplate {
    uint256 public feeRate = 30; // 0.3 %  (basis: 10000)

    constructor(address cluster) NormalTemplate(cluster, "FeeEngine") {}

    function calculateFee(uint256 amount) external view returns (uint256) {
        return (amount * feeRate) / 10000;
    }

    function setFeeRate(uint256 rate) external onlyActiveMember {
        feeRate = rate;
    }
}
