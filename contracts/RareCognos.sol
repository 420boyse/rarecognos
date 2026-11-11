// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/math/Math.sol';

contract RareCognos is ERC721Enumerable {
    uint256 public constant version = 2;
    uint256 public nextId;
    mapping(uint256 => address) public creator;
    mapping(uint256 => string) private uris;
    mapping(bytes32 => uint256) public tokenForURI;
    mapping(uint256 => uint256) public transferVersion;
    event ArtworkMinted(uint256 indexed tokenId, address indexed creator, string uri);
    constructor() ERC721('RareCognos', 'RARE') {}
    function _update(address to, uint256 id, address auth) internal override returns (address) {
        address from = super._update(to, id, auth);
        ++transferVersion[id];
        return from;
    }
    function mint(string calldata uri) external returns (uint256 id) {
        bytes memory u = bytes(uri);
        require(u.length > 14 && u.length <= 200, 'Invalid URI');
        require(bytes7(u) == bytes7('ipfs://'), 'IPFS URI required');
        bytes32 key = keccak256(u);
        require(tokenForURI[key] == 0, 'Edition already minted');
        id = ++nextId;
        uris[id] = uri;
        creator[id] = msg.sender;
        tokenForURI[key] = id;
        _safeMint(msg.sender, id);
        emit ArtworkMinted(id, msg.sender, uri);
    }
    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return uris[id];
    }
}

contract RareCognosMarket is ReentrancyGuard, Ownable {
    RareCognos public immutable collection;
    uint256 public constant FEE_BPS = 25;
    uint256 public constant BPS_DENOMINATOR = 10000;
    address public treasury;
    struct Listing { address seller; uint256 tokenId; uint256 price; bool active; uint256 nonce; }
    uint256 public count;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256) public activeListing;
    event Listed(uint256 indexed id, address indexed seller, uint256 indexed tokenId, uint256 price);
    event Purchased(uint256 indexed id, address indexed buyer);
    event Cancelled(uint256 indexed id);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event SaleSettled(uint256 indexed id, address indexed seller, address indexed treasury, uint256 price, uint256 fee, uint256 sellerProceeds);
    constructor(address nft, address initialTreasury) Ownable(msg.sender) {
        require(nft != address(0), 'Invalid collection');
        require(initialTreasury != address(0) && initialTreasury != address(this), 'Invalid treasury');
        collection = RareCognos(nft);
        treasury = initialTreasury;
        emit TreasuryUpdated(address(0), initialTreasury);
    }
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0) && newTreasury != address(this), 'Invalid treasury');
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }
    function approved(uint256 tokenId, address owner) public view returns (bool) {
        return collection.getApproved(tokenId) == address(this) || collection.isApprovedForAll(owner, address(this));
    }
    function list(uint256 tokenId, uint256 price) external nonReentrant returns (uint256 id) {
        require(price > 0, 'Zero price');
        require(collection.ownerOf(tokenId) == msg.sender, 'Not owner');
        require(approved(tokenId, msg.sender), 'Approval required');
        uint256 old = activeListing[tokenId];
        if (old != 0) listings[old].active = false;
        id = ++count;
        listings[id] = Listing(msg.sender, tokenId, price, true, collection.transferVersion(tokenId));
        activeListing[tokenId] = id;
        emit Listed(id, msg.sender, tokenId, price);
    }
    function cancel(uint256 id) external nonReentrant {
        Listing storage l = listings[id];
        require(l.active && l.seller == msg.sender, 'Not active seller');
        l.active = false;
        activeListing[l.tokenId] = 0;
        emit Cancelled(id);
    }
    function buy(uint256 id, uint256 expectedPrice) external payable nonReentrant {
        Listing storage l = listings[id];
        require(l.active && l.seller != msg.sender, 'Unavailable');
        require(l.price == expectedPrice && msg.value == l.price, 'Price changed');
        require(collection.ownerOf(l.tokenId) == l.seller && approved(l.tokenId, l.seller) && collection.transferVersion(l.tokenId) == l.nonce, 'Stale listing');
        l.active = false;
        activeListing[l.tokenId] = 0;
        address recipient = treasury;
        uint256 fee = Math.mulDiv(msg.value, FEE_BPS, BPS_DENOMINATOR);
        uint256 proceeds = msg.value - fee;
        collection.safeTransferFrom(l.seller, msg.sender, l.tokenId);
        (bool ok,) = payable(l.seller).call{value: proceeds}('');
        require(ok, 'Seller cannot receive native payment');
        if (fee != 0) {
            (ok,) = payable(recipient).call{value: fee}('');
            require(ok, 'Treasury cannot receive native payment');
        }
        emit Purchased(id, msg.sender);
        emit SaleSettled(id, l.seller, recipient, msg.value, fee, proceeds);
    }
}
