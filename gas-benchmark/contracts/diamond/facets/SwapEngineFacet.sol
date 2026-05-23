// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../libraries/AppStorage.sol";

/// Accesses AppStorage directly — no cross-facet proxy calls needed.
contract SwapEngineFacet {
    function swap(uint256 pairId, uint256 amountIn) external returns (uint256 amountOut) {
        AppStorage.Layout storage s = AppStorage.layout();
        AppStorage.Pair storage p = s.pairs[pairId];
        uint256 fee   = (amountIn * s.feeRate) / 10000;
        uint256 netIn = amountIn - fee;
        amountOut     = (netIn * p.r1) / (p.r0 + netIn);
        p.r0 += netIn;
        p.r1 -= amountOut;
    }
}
