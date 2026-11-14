// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

/// @notice One collection, nine faces, one hundred copies of each.
contract RareCognosEyed is ERC721, Ownable, ReentrancyGuard {
    uint256 public constant PIECE_COUNT = 9;
    uint256 public constant PIECE_SUPPLY = 100;
    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public constant FEE_BPS = 25;
    uint256 public constant BPS = 10000;
    address public immutable treasury;
    string[9] private pieceURI;
    uint256[9] public mintedOf;

    event PieceMinted(address indexed collector, uint256 indexed piece, uint256 indexed tokenId);

    error BadPiece();
    error SoldOut();
    error IncorrectPayment();
    error PaymentFailed();

    constructor(address initialOwner, address initialTreasury, string[9] memory uris)
        ERC721("Eyed", "EYED")
        Ownable(initialOwner)
    {
        if (initialOwner == address(0) || initialTreasury == address(0)) revert BadPiece();
        treasury = initialTreasury;
        for (uint256 i; i < PIECE_COUNT; ++i) {
            if (bytes(uris[i]).length < 12 || bytes(uris[i]).length > 200) revert BadPiece();
            pieceURI[i] = uris[i];
        }
    }

    function mint(uint256 piece) external payable nonReentrant {
        if (piece >= PIECE_COUNT) revert BadPiece();
        if (mintedOf[piece] >= PIECE_SUPPLY) revert SoldOut();
        if (msg.value != MINT_PRICE) revert IncorrectPayment();
        uint256 n = mintedOf[piece];
        mintedOf[piece] = n + 1;
        uint256 tokenId = piece * PIECE_SUPPLY + n + 1;
        _safeMint(msg.sender, tokenId);
        uint256 fee = Math.mulDiv(MINT_PRICE, FEE_BPS, BPS);
        (bool ok,) = payable(treasury).call{value: fee}("");
        if (!ok) revert PaymentFailed();
        (bool paid,) = payable(owner()).call{value: msg.value - fee}("");
        if (!paid) revert PaymentFailed();
        emit PieceMinted(msg.sender, piece, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return pieceURI[(tokenId - 1) / PIECE_SUPPLY];
    }
}
