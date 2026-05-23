// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../libraries/AppStorage.sol";

contract FeeEngineFacet {
    function initFeeRate() external {
        AppStorage.layout().feeRate = 30;
    }

    function calculateFee(uint256 amount) external view returns (uint256) {
        return (amount * AppStorage.layout().feeRate) / 10000;
    }

    function setFeeRate(uint256 rate) external {
        AppStorage.layout().feeRate = rate;
    }
}
