// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title NoReentryGuard
/// @notice Simple abstract contract for reentrancy protection
abstract contract NoReentryGuard {
    bool private _locked;

    /// @notice Modifier to prevent reentrancy
    modifier nonReentrant() {
        require(!_locked, "Reentrancy detected");
        _locked = true;
        _;
        _locked = false;
    }
}