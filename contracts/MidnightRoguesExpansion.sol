// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MidnightRogues.sol";

/// The original ERC-721 always controls editions 1–10 of each character.
contract MidnightRoguesExpansion is ERC721, ReentrancyGuard {
    uint256 public constant PIECE_COUNT = 10;
    uint256 public constant PIECE_SUPPLY = 100;
    uint256 private constant ORIGINAL_SUPPLY = 10;
    uint256 private constant EXTRA_SUPPLY = PIECE_SUPPLY - ORIGINAL_SUPPLY;

    MidnightRogues public original;
    uint256[10] private extraMinted;
    event PieceMinted(address indexed collector, uint256 indexed piece, uint256 indexed tokenId);

    constructor(address firstRelease) ERC721("MIDNIGHT ROGUES", "ROGUES") {
        original = MidnightRogues(firstRelease);
        require(original.PIECE_COUNT() == PIECE_COUNT && original.PIECE_SUPPLY() == ORIGINAL_SUPPLY, "Unexpected original");
    }

    function owner() public view returns (address) { return original.owner(); }
    function MINT_PRICE() public view returns (uint256) { return original.MINT_PRICE(); }

    function editionState(uint256 piece) public view returns (uint256 minted, address mintContract) {
        require(piece < PIECE_COUNT, "Unknown character");
        uint256 first = original.mintedOf(piece);
        return (first + extraMinted[piece], first < ORIGINAL_SUPPLY ? address(original) : address(this));
    }

    function mint(uint256 piece) external payable nonReentrant {
        (uint256 minted, address target) = editionState(piece);
        require(target == address(this), "Mint from original first");
        require(minted < PIECE_SUPPLY, "Sold out");
        require(msg.value == MINT_PRICE(), "Incorrect payment");
        // Original token IDs 1–100 remain reserved, even if minted later.
        uint256 tokenId = PIECE_COUNT * ORIGINAL_SUPPLY + piece * EXTRA_SUPPLY + ++extraMinted[piece];
        _safeMint(msg.sender, tokenId);
        uint256 fee = msg.value * 25 / 10000;
        (bool feePaid,) = payable(original.treasury()).call{value: fee}("");
        (bool creatorPaid,) = payable(owner()).call{value: msg.value - fee}("");
        require(feePaid && creatorPaid, "Payment failed");
        emit PieceMinted(msg.sender, piece, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint256 piece = (tokenId - PIECE_COUNT * ORIGINAL_SUPPLY - 1) / EXTRA_SUPPLY;
        return original.tokenURI(piece * ORIGINAL_SUPPLY + 1);
    }
}
