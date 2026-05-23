// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./lib/NormalTemplate.sol";

contract PairStorage is NormalTemplate {
    struct Pair { uint256 r0; uint256 r1; }
    mapping(uint256 => Pair) private pairs;
    uint256 public pairCount;

    constructor(address cluster) NormalTemplate(cluster, "PairStorage") {}

    function addPair(uint256 r0, uint256 r1) external returns (uint256 id) {
        id = ++pairCount;
        pairs[id] = Pair(r0, r1);
    }

    function getReserves(uint256 id) external view returns (uint256, uint256) {
        return (pairs[id].r0, pairs[id].r1);
    }

    // onlyActiveMember: only SwapEngine (in activePod) may write
    function updateReserves(uint256 id, uint256 r0, uint256 r1) external onlyActiveMember {
        pairs[id] = Pair(r0, r1);
    }
}
