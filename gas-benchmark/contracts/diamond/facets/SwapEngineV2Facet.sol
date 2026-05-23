// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../libraries/AppStorage.sol";

/// Upgraded SwapEngine — adds slippage guard. Replaces SwapEngineFacet via diamondCut.
contract SwapEngineV2Facet {
    uint256 public minAmountOut;

    function setMinAmountOut(uint256 min) external {
        minAmountOut = min;
    }

    function swap(uint256 pairId, uint256 amountIn) external returns (uint256 amountOut) {
        AppStorage.Layout storage s = AppStorage.layout();
        AppStorage.Pair storage p = s.pairs[pairId];
        uint256 fee   = (amountIn * s.feeRate) / 10000;
        uint256 netIn = amountIn - fee;
        amountOut     = (netIn * p.r1) / (p.r0 + netIn);
        require(amountOut >= minAmountOut, "Slippage");
        p.r0 += netIn;
        p.r1 -= amountOut;
    }
}
