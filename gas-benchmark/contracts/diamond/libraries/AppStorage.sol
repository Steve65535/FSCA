// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// Shared application storage — all facets read/write this struct.
library AppStorage {
    bytes32 constant STORAGE_POSITION = keccak256("benchmark.app.storage");

    struct Pair {
        uint256 r0;
        uint256 r1;
    }

    struct Layout {
        // PairStorage data
        mapping(uint256 => Pair) pairs;
        uint256 pairCount;
        // FeeEngine data
        uint256 feeRate;
        // Analytics data
        uint256 totalVolume;
    }

    function layout() internal pure returns (Layout storage s) {
        bytes32 pos = STORAGE_POSITION;
        assembly { s.slot := pos }
    }
}
