// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "../libraries/AppStorage.sol";

contract PairStorageFacet {
    function addPair(uint256 r0, uint256 r1) external returns (uint256 id) {
        AppStorage.Layout storage s = AppStorage.layout();
        id = ++s.pairCount;
        s.pairs[id] = AppStorage.Pair(r0, r1);
    }

    function getReserves(uint256 id) external view returns (uint256, uint256) {
        AppStorage.Layout storage s = AppStorage.layout();
        return (s.pairs[id].r0, s.pairs[id].r1);
    }

    function updateReserves(uint256 id, uint256 r0, uint256 r1) external {
        AppStorage.Layout storage s = AppStorage.layout();
        s.pairs[id] = AppStorage.Pair(r0, r1);
    }
}
