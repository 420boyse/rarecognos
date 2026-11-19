// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// Fixed-price sales of one unit per listing. Assets are held until purchase or cancellation.
contract LiteForgeMarket is ERC1155Holder, IERC721Receiver, ReentrancyGuard {
    struct Sale { address seller; address collection; uint256 tokenId; uint256 price; bool multi; bool active; }
    mapping(uint256 => Sale) public sales;
    uint256 public count;
    address public treasury;
    event Listed(uint256 indexed id, address indexed seller, address indexed collection, uint256 tokenId, uint256 price);
    event Purchased(uint256 indexed id, address indexed buyer);
    event Cancelled(uint256 indexed id);

    constructor(address platform) { require(platform != address(0)); treasury = platform; }

    function list(address collection, uint256 tokenId, bool multi, uint256 price) external nonReentrant {
        require(price > 0, "Zero price");
        require(IERC165(collection).supportsInterface(multi ? type(IERC1155).interfaceId : type(IERC721).interfaceId), "Unsupported token");
        _transfer(collection, msg.sender, address(this), tokenId, multi);
        uint256 id = ++count;
        sales[id] = Sale(msg.sender, collection, tokenId, price, multi, true);
        emit Listed(id, msg.sender, collection, tokenId, price);
    }

    function cancel(uint256 id) external nonReentrant {
        Sale storage sale = sales[id];
        require(sale.active && msg.sender == sale.seller, "Not active seller");
        sale.active = false;
        _transfer(sale.collection, address(this), msg.sender, sale.tokenId, sale.multi);
        emit Cancelled(id);
    }

    function buy(uint256 id) external payable nonReentrant {
        Sale storage sale = sales[id];
        require(sale.active && sale.seller != msg.sender && msg.value == sale.price, "Unavailable at this price");
        sale.active = false;
        _transfer(sale.collection, address(this), msg.sender, sale.tokenId, sale.multi);
        uint256 fee = Math.mulDiv(msg.value, 25, 10000);
        (bool paid,) = payable(sale.seller).call{value: msg.value - fee}("");
        require(paid, "Seller payment failed");
        if (fee > 0) {
            (bool settled,) = payable(treasury).call{value: fee}("");
            require(settled, "Fee payment failed");
        }
        emit Purchased(id, msg.sender);
    }

    function _transfer(address collection, address from, address to, uint256 id, bool multi) private {
        if (multi) IERC1155(collection).safeTransferFrom(from, to, id, 1, "");
        else IERC721(collection).safeTransferFrom(from, to, id);
    }

    function onERC721Received(address operator, address, uint256, bytes calldata) external view returns (bytes4) {
        require(operator == address(this), "List through market");
        return this.onERC721Received.selector;
    }
    function onERC1155Received(address operator, address, uint256, uint256, bytes memory) public view override returns (bytes4) {
        require(operator == address(this), "List through market");
        return this.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(address, address, uint256[] memory, uint256[] memory, bytes memory) public pure override returns (bytes4) {
        revert("List individually");
    }
}
