// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../libraries/AppStorage.sol";

/// New analytics facet added post-deployment to demonstrate add-module cost.
contract AnalyticsFacet {
    function recordSwap(uint256 amount) external {
        AppStorage.layout().totalVolume += amount;
    }

    function getVolume() external view returns (uint256) {
        return AppStorage.layout().totalVolume;
    }
}
