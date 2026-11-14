// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One check-in per UTC day. The whole fee goes to the platform treasury.
contract RareCognosCheckIn {
    address public immutable treasury;
    uint256 public constant FEE = 0.0001 ether;
    mapping(address => uint256) public lastDay;

    event CheckedIn(address indexed account, uint256 indexed day, uint256 fee);

    error AlreadyCheckedIn();
    error IncorrectPayment();
    error PaymentFailed();

    constructor(address initialTreasury) {
        if (initialTreasury == address(0)) revert PaymentFailed();
        treasury = initialTreasury;
    }

    function checkIn() external payable {
        if (msg.value != FEE) revert IncorrectPayment();
        uint256 day = block.timestamp / 1 days;
        if (lastDay[msg.sender] == day) revert AlreadyCheckedIn();
        lastDay[msg.sender] = day;
        (bool ok,) = payable(treasury).call{value: msg.value}("");
        if (!ok) revert PaymentFailed();
        emit CheckedIn(msg.sender, day, msg.value);
    }
}
