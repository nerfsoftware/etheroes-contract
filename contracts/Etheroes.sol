// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

contract Etheroes is Initializable, ERC721Upgradeable, OwnableUpgradeable {

    // NOTE: KEEP ORDER

    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter private _tokenIdNew;

    mapping (uint256 => uint256) private _tokenDNAs;

    mapping (uint256 => uint) private _tokenForSale;

    mapping (uint256 => bool) private _tokenClaimable;

    uint _claimCost;

    mapping (uint256 => uint) private _tokenLevels;
    mapping (uint256 => uint) private _tokenLastUpgraded;

    event Minted(uint256 indexed tokenId, uint256 dna);

    event Claimed(uint256 indexed tokenId, address indexed newOwner);

    event ForSale(uint256 indexed tokenId, address indexed owner, uint price);

    event CancelForSale(uint256 indexed tokenId, address indexed owner);

    event Sale(uint256 indexed tokenId, address indexed from, address indexed to, uint price);

    uint256 constant TOTAL_SUPPLY = 10000;

    function initialize() public initializer {
        __ERC721_init("EtHeroes", "HERO");
        _setBaseURI("https://api.etheroes.io/char/");
        __Ownable_init();

        _claimCost = 1e17;
    }

    function adminMint(uint numTokens)
        external onlyOwner
    {
        require(_tokenIdNew.current() + numTokens < TOTAL_SUPPLY, "Maximum supply reached");

        for (uint i = 0; i < numTokens; i++) {
            _tokenIdNew.increment();

            uint256 newItemId = _tokenIdNew.current();
            _tokenDNAs[newItemId] = uint256(keccak256(abi.encodePacked(
                blockhash(block.number), block.timestamp, newItemId)));

            _tokenClaimable[newItemId] = true;
            _tokenLevels[newItemId] = 1;
            _tokenLastUpgraded[newItemId] = block.number;

            emit Minted(newItemId, _tokenDNAs[newItemId]);
        }
    }

    function adminWithdraw() external onlyOwner {
        msg.sender.transfer(address(this).balance);
    }

    function tokenDNA(uint256 tokenId) external view returns(uint256) {
        require(_tokenDNAs[tokenId] > 0, "The token ID does not exist");
        return _tokenDNAs[tokenId];
    }

    function tokenClaimable(uint256 tokenId) external view returns(bool) {
        require(_tokenDNAs[tokenId] > 0, "The token ID does not exist");
        return _tokenClaimable[tokenId];
    }

    function totalNumOfTokens() external view returns(uint256) {
        return _tokenIdNew.current();
    }

    function getClaimCost() external view returns(uint) {
        return _claimCost;
    }

    function adminSetClaimCost(uint claimCost) external onlyOwner {
        _claimCost = claimCost;
    }

    function claimToken(uint256 token) external payable {
        require(token <= _tokenIdNew.current(), "Invalid token ID");
        require(_tokenClaimable[token], "Already claimed");
        require(msg.value >= _claimCost, "Not enough fund");

        _safeMint(msg.sender, token);
        _tokenClaimable[token] = false;
        _setTokenURI(token, token.toString());

        // refund
        msg.sender.transfer(msg.value - _claimCost);

        emit Claimed(token, msg.sender);
    }

    function forSaleToken(uint256 token, uint price) external {
        require(ownerOf(token) == msg.sender, "You are not the owner");
        require(price > 0, "Sale price must be greater than zero");

        _tokenForSale[token] = price;

        emit ForSale(token, msg.sender, price);
    }

    function cancelSaleToken(uint256 token) external {
        require(ownerOf(token) == msg.sender, "You are not the owner");
        require(_tokenForSale[token] > 0, "Token is not for sale");

        _tokenForSale[token] = 0;

        emit CancelForSale(token, msg.sender);
    }

    function buyToken(uint256 token) external payable {
        uint salePrice = _tokenForSale[token];

        address originalOwner = ownerOf(token);

        require(originalOwner != msg.sender, "You already own the token");
        require(salePrice > 0, "Token is not for sale");
        require(msg.value >= salePrice, "Not enough funds");

        payable(originalOwner).transfer(salePrice);
        _transferAndClear(originalOwner, msg.sender, token);
        msg.sender.transfer(msg.value - salePrice);

        emit Sale(token, originalOwner, msg.sender, salePrice);
    }

    function _transferAndClear(address from, address to, uint256 token) private {
        _safeTransfer(from, to, token, "");
        _tokenForSale[token] = 0;
    }

    function listTokensForSale() external view returns(uint256[] memory) {
        uint256 numTokens = totalSupply();
        uint256 numTokensForSale = 0;
        for (uint256 i = 0; i < numTokens; i++) {
            uint256 token = tokenByIndex(i);
            if (_tokenForSale[token] > 0) {
                numTokensForSale++;
            }
        }
        uint256[] memory tokens = new uint256[](numTokensForSale);
        for (uint256 i = 0; i < numTokensForSale; i++) {
            uint256 token = tokenByIndex(i);
            if (_tokenForSale[token] > 0) {
                tokens[i] = token;
            }
        }
        return tokens;
    }

    function salePrice(uint256 token) external view returns(uint) {
        require(_tokenForSale[token] > 0, "Token is not for sale");

        return _tokenForSale[token];
    }

    function getTokenLevel(uint256 token) external view returns(uint) {
        require(_tokenLevels[token] > 0, "Invalid token ID");

        return _tokenLevels[token];
    }

    function getTokenNextAvailableLevelUp(uint256 token) external view returns(uint) {
        require(_tokenLevels[token] > 0, "Invalid token ID");

        uint currentLevel = _tokenLevels[token];

        uint requiredElapse = 300 * (16 ** (currentLevel - 1)) / (10 ** (currentLevel - 1));

        if (_tokenLastUpgraded[token] == 0) {
            return block.number + requiredElapse;
        } else {
            return _tokenLastUpgraded[token] + requiredElapse;
        }
    }
}
