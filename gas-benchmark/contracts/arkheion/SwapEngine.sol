// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./lib/NormalTemplate.sol";

interface IPairStorage {
    function getReserves(uint256 id) external view returns (uint256, uint256);
    function updateReserves(uint256 id, uint256 r0, uint256 r1) external;
}
interface IFeeEngine {
    function calculateFee(uint256 amount) external view returns (uint256);
}

// Pod IDs
uint32 constant PAIR_STORAGE_ID = 1;
uint32 constant FEE_ENGINE_ID   = 2;

contract SwapEngine is NormalTemplate {
    constructor(address cluster) NormalTemplate(cluster, "SwapEngine") {}

    /// Resolves dependency addresses from activePod at call time — no hardcoded addresses.
    function swap(uint256 pairId, uint256 amountIn) external returns (uint256 amountOut) {
        address pairAddr = getActiveModuleAddress(PAIR_STORAGE_ID);
        address feeAddr  = getActiveModuleAddress(FEE_ENGINE_ID);

        (uint256 r0, uint256 r1) = IPairStorage(pairAddr).getReserves(pairId);
        uint256 fee    = IFeeEngine(feeAddr).calculateFee(amountIn);
        uint256 netIn  = amountIn - fee;
        amountOut      = (netIn * r1) / (r0 + netIn);
        IPairStorage(pairAddr).updateReserves(pairId, r0 + netIn, r1 - amountOut);
    }
}
