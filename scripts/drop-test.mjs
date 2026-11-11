import assert from 'node:assert/strict';
import { localSetup } from './nft-local.mjs';
import fs from 'node:fs';
import { decodeEventLog, parseEther, getAddress } from 'viem';
const equalAddress = (a, b) => assert.equal(getAddress(a), getAddress(b));

const s = await localSetup();
const { client, wallets, addresses, factory } = s;
const artifact = JSON.parse(fs.readFileSync('artifacts/RareCognosDrop.json'));
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS', name); }
async function rejects(p, message) { await assert.rejects(p, message); }
async function create(price = 0n, max = 10n, limit = 3n, start = 0n, end = 0n, wallet = wallets[0]) {
  const hash = await wallet.writeContract({ ...factory, functionName: 'createDrop', args: ['Edition', 'ED', 'Test edition', 'ipfs://bafytest/metadata.json', max, price, limit, start, end] });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, 'success');
  const log = receipt.logs.map(l => { try { return decodeEventLog({ abi: factory.abi, data: l.data, topics: l.topics }); } catch { return null; } }).find(l => l?.eventName === 'DropCreated');
  return { address: log.args.drop, abi: artifact.abi };
}
async function balances() { return Promise.all([client.getBalance({ address: addresses[0] }), client.getBalance({ address: addresses[2] })]); }
try {
  let drop;
  await test('creator owns collection and factory indexes it', async () => {
    drop = await create();
    equalAddress(await client.readContract({ ...drop, functionName: 'owner' }), addresses[0]);
    equalAddress(await client.readContract({ ...factory, functionName: 'creatorDropAt', args: [addresses[0], 0n] }), drop.address);
    assert.equal(await client.readContract({ ...factory, functionName: 'isDrop', args: [drop.address] }), true);
  });
  await test('free mint has no fee and collector receives token', async () => {
    const before = await balances();
    const h = await wallets[1].writeContract({ ...drop, functionName: 'publicMint', args: [2n], value: 0n });
    assert.equal((await client.waitForTransactionReceipt({ hash: h })).status, 'success');
    equalAddress(await client.readContract({ ...drop, functionName: 'ownerOf', args: [2n] }), addresses[1]);
    assert.equal(await client.readContract({ ...drop, functionName: 'totalMinted' }), 2n);
    const after = await balances();
    assert.equal(after[1], before[1]);
  });
  await test('wallet limit and paid value on free mint are rejected', async () => {
    await rejects(wallets[1].writeContract({ ...drop, functionName: 'publicMint', args: [2n] }));
    await rejects(wallets[1].writeContract({ ...drop, functionName: 'publicMint', args: [1n], value: 1n }));
  });
  await test('paid mint settles exactly 0.25% / 99.75%', async () => {
    const deployHash = await wallets[2].deployContract({ ...artifact, args: [addresses[2], addresses[0], 'Paid', 'PAID', 'Paid test', 'ipfs://bafytest/paid.json', 10n, parseEther('1'), 3n, 0n, 0n] });
    const paid = { address: (await client.waitForTransactionReceipt({ hash: deployHash })).contractAddress, abi: artifact.abi };
    const before = await balances();
    const h = await wallets[1].writeContract({ ...paid, functionName: 'publicMint', args: [1n], value: parseEther('1') });
    assert.equal((await client.waitForTransactionReceipt({ hash: h })).status, 'success');
    const after = await balances();
    assert.equal(after[0] - before[0], parseEther('0.0025'));
    const creatorAfter = await client.getBalance({ address: addresses[2] });
    assert.equal(creatorAfter - before[1], parseEther('0.9975'));
  });
  await test('overpayment and underpayment revert atomically', async () => {
    const paid = await create(parseEther('0.01'));
    await rejects(wallets[1].writeContract({ ...paid, functionName: 'publicMint', args: [1n], value: parseEther('0.011') }));
    await rejects(wallets[1].writeContract({ ...paid, functionName: 'publicMint', args: [1n], value: parseEther('0.009') }));
    assert.equal(await client.readContract({ ...paid, functionName: 'totalMinted' }), 0n);
  });
  await test('max supply is enforced', async () => {
    const limited = await create(0n, 2n, 2n);
    const h = await wallets[1].writeContract({ ...limited, functionName: 'publicMint', args: [2n] });
    await client.waitForTransactionReceipt({ hash: h });
    await rejects(wallets[2].writeContract({ ...limited, functionName: 'publicMint', args: [1n] }));
  });
  await test('future and expired windows are closed', async () => {
    const now = (await client.getBlock()).timestamp;
    const future = await create(0n, 5n, 5n, now + 10000n, now + 20000n);
    await rejects(wallets[1].writeContract({ ...future, functionName: 'publicMint', args: [1n] }));
    const expired = await create(0n, 5n, 5n, now - 200n, now - 100n);
    await rejects(wallets[1].writeContract({ ...expired, functionName: 'publicMint', args: [1n] }));
  });
  await test('only creator pauses; pause prevents mint', async () => {
    await rejects(wallets[1].writeContract({ ...drop, functionName: 'setMintingActive', args: [false] }));
    const h = await wallets[0].writeContract({ ...drop, functionName: 'setMintingActive', args: [false] });
    await client.waitForTransactionReceipt({ hash: h });
    await rejects(wallets[2].writeContract({ ...drop, functionName: 'publicMint', args: [1n] }));
  });
  await test('zero quantity and malformed configuration revert', async () => {
    await rejects(wallets[1].writeContract({ ...drop, functionName: 'publicMint', args: [0n] }));
    await rejects(create(0n, 0n, 1n));
    await rejects(create(0n, 2n, 3n));
  });
  console.log(`\n${passed} drop contract tests passed. Local Ganache only; no external transactions.`);
} finally { await s.server.close(); }
