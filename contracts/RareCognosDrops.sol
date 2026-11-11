// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

/// @notice One creator-owned ERC-721 edition. Every token shares immutable IPFS metadata.
contract RareCognosDrop is ERC721, Ownable, ReentrancyGuard {
    uint256 public constant FEE_BPS = 25;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public immutable maxSupply;
    uint256 public immutable mintPrice;
    uint256 public immutable maxMintsPerWallet;
    uint256 public immutable mintStart;
    uint256 public immutable mintEnd;
    address public immutable treasury;
    address public immutable proceedsRecipient;
    string public description;
    string public metadataURI;
    uint256 public totalMinted;
    bool public mintingActive = true;
    mapping(address => uint256) public mintedBy;

    event PublicMint(address indexed collector, uint256 indexed firstTokenId, uint256 quantity, uint256 price, uint256 fee, uint256 creatorProceeds);
    event MintingActiveUpdated(bool active);

    error InvalidConfiguration();
    error MintClosed();
    error MintInactive();
    error SupplyExceeded();
    error WalletLimitExceeded();
    error IncorrectPayment();
    error PaymentFailed();

    constructor(
        address initialOwner,
        address initialTreasury,
        string memory name_,
        string memory symbol_,
        string memory description_,
        string memory metadataURI_,
        uint256 maxSupply_,
        uint256 mintPrice_,
        uint256 maxMintsPerWallet_,
        uint256 mintStart_,
        uint256 mintEnd_
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        bytes memory uri = bytes(metadataURI_);
        if (initialOwner == address(0) || initialTreasury == address(0) || initialTreasury == address(this) ||
            bytes(name_).length == 0 || bytes(name_).length > 120 || bytes(symbol_).length == 0 ||
            bytes(symbol_).length > 32 || bytes(description_).length > 2000 || uri.length <= 7 || uri.length > 2000 ||
            bytes7(uri) != bytes7('ipfs://') || maxSupply_ == 0 || maxMintsPerWallet_ == 0 ||
            maxMintsPerWallet_ > maxSupply_ || (mintStart_ == 0) != (mintEnd_ == 0) ||
            (mintEnd_ != 0 && mintStart_ >= mintEnd_)) revert InvalidConfiguration();
        treasury = initialTreasury;
        proceedsRecipient = initialOwner;
        description = description_;
        metadataURI = metadataURI_;
        maxSupply = maxSupply_;
        mintPrice = mintPrice_;
        maxMintsPerWallet = maxMintsPerWallet_;
        mintStart = mintStart_;
        mintEnd = mintEnd_;
    }

    function mintingOpen() public view returns (bool) {
        return mintingActive && totalMinted < maxSupply && (mintStart == 0 ||
            (block.timestamp >= mintStart && block.timestamp < mintEnd));
    }

    function quote(uint256 quantity) public view returns (uint256 total, uint256 fee, uint256 creatorProceeds) {
        total = mintPrice * quantity;
        fee = Math.mulDiv(total, FEE_BPS, BPS_DENOMINATOR);
        creatorProceeds = total - fee;
    }

    function publicMint(uint256 quantity) external payable nonReentrant {
        if (quantity == 0) revert InvalidConfiguration();
        if (!mintingOpen()) {
            if (mintStart != 0 && (block.timestamp < mintStart || block.timestamp >= mintEnd)) revert MintClosed();
            revert MintInactive();
        }
        if (quantity > maxSupply - totalMinted) revert SupplyExceeded();
        if (quantity > maxMintsPerWallet || mintedBy[msg.sender] > maxMintsPerWallet - quantity) revert WalletLimitExceeded();
        (uint256 total, uint256 fee, uint256 proceeds) = quote(quantity);
        if (msg.value != total) revert IncorrectPayment();
        uint256 firstTokenId = totalMinted + 1;
        totalMinted += quantity;
        mintedBy[msg.sender] += quantity;
        for (uint256 i; i < quantity; ++i) _safeMint(msg.sender, firstTokenId + i);
        if (fee != 0) {
            (bool ok,) = payable(treasury).call{value: fee}('');
            if (!ok) revert PaymentFailed();
        }
        if (proceeds != 0) {
            (bool ok,) = payable(proceedsRecipient).call{value: proceeds}('');
            if (!ok) revert PaymentFailed();
        }
        emit PublicMint(msg.sender, firstTokenId, quantity, total, fee, proceeds);
    }

    function setMintingActive(bool active) external onlyOwner {
        mintingActive = active;
        emit MintingActiveUpdated(active);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return metadataURI;
    }
}

/// @notice Deploys independent collections; it cannot control existing RareCognos deployments.
contract RareCognosDropFactory is Ownable {
    address public treasury;
    address[] public allDrops;
    mapping(address => address[]) private creatorDrops;
    mapping(address => bool) public isDrop;
    event DropCreated(address indexed creator, address indexed drop);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    error InvalidTreasury();

    constructor(address initialTreasury) Ownable(msg.sender) {
        if (initialTreasury == address(0) || initialTreasury == address(this)) revert InvalidTreasury();
        treasury = initialTreasury;
        emit TreasuryUpdated(address(0), initialTreasury);
    }

    function createDrop(
        string calldata name,
        string calldata symbol,
        string calldata description,
        string calldata metadataURI,
        uint256 maxSupply,
        uint256 mintPrice,
        uint256 maxMintsPerWallet,
        uint256 mintStart,
        uint256 mintEnd
    ) external returns (address drop) {
        drop = address(new RareCognosDrop(msg.sender, treasury, name, symbol, description, metadataURI,
            maxSupply, mintPrice, maxMintsPerWallet, mintStart, mintEnd));
        allDrops.push(drop);
        creatorDrops[msg.sender].push(drop);
        isDrop[drop] = true;
        emit DropCreated(msg.sender, drop);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0) || newTreasury == address(this)) revert InvalidTreasury();
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    function creatorDropCount(address creator) external view returns (uint256) { return creatorDrops[creator].length; }
    function creatorDropAt(address creator, uint256 index) external view returns (address) { return creatorDrops[creator][index]; }
    function dropCount() external view returns (uint256) { return allDrops.length; }
}
