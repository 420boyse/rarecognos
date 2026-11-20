// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RareCognosDrops.sol";

/// The CREATE2 deployment proxy is permissionless. Administration goes directly
/// to the project wallet regardless of which account pays the deployment gas.
contract RareCognosEditionFactory is RareCognosDropFactory {
    constructor(address projectOwner, address platformTreasury) RareCognosDropFactory(platformTreasury) {
        require(projectOwner != address(0), "Missing project owner");
        _transferOwnership(projectOwner);
    }
}
