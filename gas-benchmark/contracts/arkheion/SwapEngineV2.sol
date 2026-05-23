// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./lib/NormalTemplate.sol";

interface IPairStorageV2 {
    function getReserves(uint256 id) external view returns (uint256, uint256);
    function updateReserves(uint256 id, uint256 r0, uint256 r1) external;
}
interface IFeeEngineV2 {
    function calculateFee(uint256 amount) external view returns (uint256);
}

uint32 constant PAIR_STORAGE_ID_V2 = 1;
uint32 constant FEE_ENGINE_ID_V2   = 2;


/// Upgraded SwapEngine — adds a slippage guard (simulates a real upgrade).
contract SwapEngineV2 is NormalTemplate {
    uint256 public minAmountOut;

    constructor(address cluster) NormalTemplate(cluster, "SwapEngineV2") {}

    function setMinAmountOut(uint256 min) external { minAmountOut = min; }

    function swap(uint256 pairId, uint256 amountIn) external returns (uint256 amountOut) {
        address pairAddr = getActiveModuleAddress(PAIR_STORAGE_ID_V2);
        address feeAddr  = getActiveModuleAddress(FEE_ENGINE_ID_V2);

        (uint256 r0, uint256 r1) = IPairStorageV2(pairAddr).getReserves(pairId);
        uint256 fee   = IFeeEngineV2(feeAddr).calculateFee(amountIn);
        uint256 netIn = amountIn - fee;
        amountOut     = (netIn * r1) / (r0 + netIn);
        require(amountOut >= minAmountOut, "Slippage");
        IPairStorageV2(pairAddr).updateReserves(pairId, r0 + netIn, r1 - amountOut);
    }
}
