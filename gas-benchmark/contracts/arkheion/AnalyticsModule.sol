// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./lib/NormalTemplate.sol";

/// New analytics module added post-deployment to demonstrate add-module cost.
contract AnalyticsModule is NormalTemplate {
    uint256 public totalVolume;

    constructor(address cluster) NormalTemplate(cluster, "AnalyticsModule") {}

    function recordSwap(uint256 amount) external onlyActiveMember {
        totalVolume += amount;
    }

    function getVolume() external view returns (uint256) {
        return totalVolume;
    }
}
