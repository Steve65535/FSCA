// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "./lib/NormalTemplate.sol";

/// Minimal cluster used only in the benchmark — no multi-sig, no EvokerManager.
contract MockCluster {
    address public immutable owner;
    address public evokerManagerAddr; // kept zero; NormalTemplate checks this

    constructor() { owner = msg.sender; }

    function evokerManager() external view returns (address) { return evokerManagerAddr; }

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    // ── pod wiring helpers ──────────────────────────────────────────────────

    function addActivePod(address src, uint32 id, address target) external onlyOwner {
        NormalTemplate(src).addActiveModule(id, target);
    }
    function addPassivePod(address src, uint32 id, address target) external onlyOwner {
        NormalTemplate(src).addPassiveModule(id, target);
    }
    function removeActivePod(address src, uint32 id) external onlyOwner {
        NormalTemplate(src).removeActiveModule(id);
    }
    function removePassivePod(address src, uint32 id) external onlyOwner {
        NormalTemplate(src).removePassiveModule(id);
    }
    function setId(address src, uint32 id) external onlyOwner {
        NormalTemplate(src).setContractId(id);
    }
    function mount(address src) external onlyOwner {
        NormalTemplate(src).setWhetherMounted(1);
    }
    function unmount(address src) external onlyOwner {
        NormalTemplate(src).setWhetherMounted(0);
    }
}
