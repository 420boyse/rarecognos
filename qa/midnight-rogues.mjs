import assert from "node:assert/strict";
import fs from "node:fs";
import { concatHex, keccak256, parseAbi, parseEther } from "viem";
import { localSetup } from "../scripts/nft-local.mjs";

const release = JSON.parse(fs.readFileSync("config/midnight-rogues.json"));
const { initCode } = JSON.parse(fs.readFileSync("public/contracts/MidnightRogues.json"));
const rogues = JSON.parse(fs.readFileSync("src/data/midnight-rogues.json"));
const abi = parseAbi(["function owner() view returns (address)", "function mint(uint256) payable",
  "function tokenURI(uint256) view returns (string)", "function ownerOf(uint256) view returns (address)",
  "function mintedOf(uint256) view returns (uint256)"]);
const { server, client, wallets } = await localSetup();
try {
  const proxyCode = "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
  await server.provider.request({ method: "evm_setAccountCode", params: [release.proxy, proxyCode] });
  const wallet = wallets[1], price = parseEther("0.001");
  const data = concatHex([release.salt, initCode]);
  const confirmed = async (tx) => assert.equal((await client.waitForTransactionReceipt({ hash: await tx })).status, "success");
  await confirmed(wallet.sendTransaction({ to: release.proxy, data }));
  assert.equal(keccak256(await client.getCode({ address: release.address })), release.runtimeHash);
  const call = { address: release.address, abi };
  assert.equal(await client.readContract({ ...call, functionName: "owner" }), release.owner);
  async function balance(address) { return client.getBalance({ address }); }
  const before = await balance(release.owner), beforeFee = await balance(release.treasury);
  const mint = (piece, value) => wallet.writeContract({ ...call, functionName: "mint", args: [BigInt(piece)], value });
  await assert.rejects(mint(10, price));
  await assert.rejects(mint(0, price - 1n));
  assert.equal(rogues.length, 10);
  for (const [index, rogue] of rogues.entries()) {
    await confirmed(mint(index, price));
    const token = BigInt(index * 10 + 1);
    const uri = await client.readContract({ ...call, functionName: "tokenURI", args: [token] });
    assert.equal(await client.readContract({ ...call, functionName: "ownerOf", args: [token] }), wallet.account.address);
    assert.equal(uri, `https://rarecognos.com/meta/midnight-rogues/${rogue.id}.json`);
    const metadata = JSON.parse(fs.readFileSync("public" + new URL(uri).pathname));
    assert.ok(metadata.name.includes(rogue.name));
    assert.equal(metadata.description, rogue.story);
    assert.ok(fs.existsSync("public" + new URL(metadata.image).pathname));
  }
  for (let i = 1; i < 10; ++i) await confirmed(mint(0, price));
  await assert.rejects(mint(0, price));
  assert.equal(await client.readContract({ ...call, functionName: "mintedOf", args: [0n] }), 10n);
  const fee = price * 25n / 10000n;
  assert.equal((await balance(release.owner)) - before, 19n * (price - fee));
  assert.equal((await balance(release.treasury)) - beforeFee, 19n * fee);
  const extension = JSON.parse(fs.readFileSync("config/midnight-rogues-expansion.json"));
  const extraCode = JSON.parse(fs.readFileSync("public/contracts/MidnightRoguesExpansion.json")).initCode;
  await confirmed(wallet.sendTransaction({ to: extension.proxy, data: concatHex([extension.salt, extraCode]) }));
  assert.equal(keccak256(await client.getCode({ address: extension.address })), extension.runtimeHash);
  const extra = { address: extension.address, abi: [...abi, ...parseAbi([
    "function editionState(uint256) view returns (uint256,address)",
    "function original() view returns (address)", "function PIECE_SUPPLY() view returns (uint256)",
  ])] };
  const state = (piece) => client.readContract({ ...extra, functionName: "editionState", args: [BigInt(piece)] });
  const extraMint = (piece, value = price) => wallet.writeContract({ ...extra, functionName: "mint", args: [BigInt(piece)], value });
  assert.equal(await client.readContract({ ...extra, functionName: "original" }), release.address);
  assert.equal(await client.readContract({ ...extra, functionName: "PIECE_SUPPLY" }), 100n);
  assert.equal(await client.readContract({ ...extra, functionName: "owner" }), release.owner);
  assert.deepEqual(await state(0), [10n, extension.address]);
  assert.deepEqual(await state(9), [1n, release.address]);
  await assert.rejects(extraMint(9));
  await assert.rejects(extraMint(10));
  await assert.rejects(extraMint(0, price - 1n));

  const creatorBalance = await balance(release.owner), feeBalance = await balance(release.treasury);
  for (let i = 10; i < 100; ++i) await confirmed(extraMint(0));
  assert.deepEqual(await state(0), [100n, extension.address]);
  await assert.rejects(extraMint(0));
  assert.equal((await balance(release.owner)) - creatorBalance, 90n * (price - fee));
  assert.equal((await balance(release.treasury)) - feeBalance, 90n * fee);
  for (const id of [101n, 190n]) {
    assert.equal(await client.readContract({ ...extra, functionName: "tokenURI", args: [id] }),
      await client.readContract({ ...call, functionName: "tokenURI", args: [1n] }));
    assert.equal(await client.readContract({ ...extra, functionName: "ownerOf", args: [id] }), wallet.account.address);
  }
  for (let i = 1; i < 10; ++i) await confirmed(mint(9, price));
  assert.deepEqual(await state(9), [10n, extension.address]);
  await confirmed(extraMint(9));
  assert.deepEqual(await state(9), [11n, extension.address]);
  assert.equal(await client.readContract({ ...extra, functionName: "tokenURI", args: [911n] }),
    await client.readContract({ ...call, functionName: "tokenURI", args: [91n] }));
  console.log("Passed original ownership, 10→11 transition, 100th edition, sold-out protection, metadata and payouts.");
} finally { await server.close(); }
