// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MidnightRogues is ERC721, Ownable, ReentrancyGuard {
    uint256 public constant PIECE_COUNT = 10;
    uint256 public constant PIECE_SUPPLY = 10;
    uint256 public constant MINT_PRICE = 0.001 ether;
    uint256[10] public mintedOf;
    address public treasury;
    event PieceMinted(address indexed collector, uint256 indexed piece, uint256 indexed tokenId);

    constructor(address creator, address platform) ERC721("MIDNIGHT ROGUES", "ROGUES") Ownable(creator) {
        require(platform != address(0), "Missing treasury");
        treasury = platform;
    }

    function mint(uint256 piece) external payable nonReentrant {
        require(piece < PIECE_COUNT, "Unknown character");
        require(mintedOf[piece] < PIECE_SUPPLY, "Sold out");
        require(msg.value == MINT_PRICE, "Incorrect payment");
        uint256 tokenId = piece * PIECE_SUPPLY + ++mintedOf[piece];
        _safeMint(msg.sender, tokenId);
        uint256 fee = MINT_PRICE * 25 / 10000;
        (bool feePaid,) = payable(treasury).call{value: fee}("");
        (bool creatorPaid,) = payable(owner()).call{value: msg.value - fee}("");
        require(feePaid && creatorPaid, "Payment failed");
        emit PieceMinted(msg.sender, piece, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint256 number = (tokenId - 1) / PIECE_SUPPLY + 1;
        return string.concat("https://rarecognos.com/meta/midnight-rogues/", number < 10 ? "00" : "0", Strings.toString(number), ".json");
    }
}
