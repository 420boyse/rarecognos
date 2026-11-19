import assert from "node:assert/strict";
import fs from "node:fs";
import solc from "solc";
import { concatHex, keccak256, parseAbi } from "viem";
import { localSetup } from "../scripts/nft-local.mjs";

const release = JSON.parse(fs.readFileSync("config/liteforge-market.json"));
const { initCode } = JSON.parse(fs.readFileSync("public/contracts/LiteForgeMarket.json"));
const proxyCode =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
const abi = parseAbi([
  "function list(address,uint256,bool,uint256)",
  "function buy(uint256) payable",
  "function cancel(uint256)",
  "function sales(uint256) view returns(address,address,uint256,uint256,bool,bool)",
]);
const { server, client, wallets, nft } = await localSetup();
try {
  const confirmed = async (hash) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await hash });
    assert.equal(receipt.status, "success");
    return receipt;
  };
  const [seller, buyer] = wallets;
  const market = { address: release.address, abi },
    price = 1000000n;
  await server.provider.request({
    method: "evm_setAccountCode",
    params: [release.proxy, proxyCode],
  });
  await confirmed(
    seller.sendTransaction({ to: release.proxy, data: concatHex([release.salt, initCode]) }),
  );
  assert.equal(keccak256(await client.getCode({ address: release.address })), release.runtimeHash);
  const source =
    'pragma solidity ^0.8.24; import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol"; contract Edition is ERC1155 { constructor() ERC1155("") { _mint(msg.sender, 0, 2, ""); } }';
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "E.sol": { content: source } },
        settings: {
          evmVersion: "shanghai",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
      { import: (p) => ({ contents: fs.readFileSync("node_modules/" + p, "utf8") }) },
    ),
  ).contracts["E.sol"].Edition;
  const deployed = await confirmed(
    seller.deployContract({ abi: compiled.abi, bytecode: "0x" + compiled.evm.bytecode.object }),
  );
  const erc1155 = { address: deployed.contractAddress, abi: compiled.abi };
  await confirmed(
    seller.writeContract({ ...nft, functionName: "mint", args: ["ipfs://bafytest/external"] }),
  );
  let id = 0n;
  for (const [asset, multi, token] of [
    [nft, false, 1n],
    [erc1155, true, 0n],
  ]) {
    const list = () =>
      seller.writeContract({
        ...market,
        functionName: "list",
        args: [asset.address, token, multi, price],
      });
    await assert.rejects(list());
    await confirmed(
      seller.writeContract({
        ...asset,
        functionName: multi ? "setApprovalForAll" : "approve",
        args: [market.address, multi ? true : token],
      }),
    );
    await confirmed(list());
    ++id;
    await assert.rejects(buyer.writeContract({ ...market, functionName: "cancel", args: [id] }));
    await confirmed(seller.writeContract({ ...market, functionName: "cancel", args: [id] }));
    assert.equal(
      (await client.readContract({ ...market, functionName: "sales", args: [id] }))[5],
      false,
    );
    if (!multi)
      await confirmed(
        seller.writeContract({ ...asset, functionName: "approve", args: [market.address, token] }),
      );
    await confirmed(list());
    ++id;
    await assert.rejects(
      buyer.writeContract({ ...market, functionName: "buy", args: [id], value: price - 1n }),
    );
    const before = await client.getBalance({ address: seller.account.address }),
      feeBefore = await client.getBalance({ address: release.treasury });
    await confirmed(
      buyer.writeContract({ ...market, functionName: "buy", args: [id], value: price }),
    );
    assert.equal(
      (await client.getBalance({ address: seller.account.address })) - before,
      (price * 9975n) / 10000n,
    );
    assert.equal(
      (await client.getBalance({ address: release.treasury })) - feeBefore,
      (price * 25n) / 10000n,
    );
    assert.equal(
      (await client.readContract({ ...market, functionName: "sales", args: [id] }))[5],
      false,
    );
    if (multi) {
      for (const wallet of [seller, buyer])
        assert.equal(
          await client.readContract({
            ...asset,
            functionName: "balanceOf",
            args: [wallet.account.address, 0n],
          }),
          1n,
        );
    } else
      assert.equal(
        await client.readContract({ ...asset, functionName: "ownerOf", args: [1n] }),
        buyer.account.address,
      );
  }
  console.log(
    "PASS ERC-721 and ERC-1155 ownership, approvals, escrow, cancellation, sale, fee, and single-unit delivery.",
  );
} finally {
  await server.close();
}
