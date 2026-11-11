// Local-only browser verification: all external traffic and wallet transactions are mocked.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { decodeAbiParameters } from "viem";

const account = "0xffd9618e19fb7f74169f75343550e14b74d19cb3";
const collection = "0x1111111111111111111111111111111111111111";
const treasury = "0x2222222222222222222222222222222222222222";
const txHash = `0x${"12".repeat(32)}`;
const server = spawn("npm", ["run", "nft:deploy:local"], { stdio: "ignore" });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw Error("Local server exited before ready (port must be free)");
    try { if ((await fetch("http://127.0.0.1:8080/")).ok) { ready = true; break; } } catch { /* starting */ }
    await delay(250);
  }
  assert.ok(ready, "Server did not start");
  browser = await chromium.launch();
  async function makePage({ market = false, wrong = false, mode = "reject" } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
      if (url.hostname !== "rpc.testnet.liteforge.zeeve.net") return route.abort();
      const input = JSON.parse(route.request().postData());
      const reply = ({ id, method }) => {
        const results = {
          eth_chainId: "0x1159", eth_call: "0x", eth_estimateGas: "0x100000", eth_gasPrice: "0x989680",
          eth_blockNumber: "0x100", eth_getBalance: "0x16345785d8a0000", eth_getTransactionCount: "0x0",
          eth_getTransactionByHash: null,
          eth_getTransactionReceipt: { transactionHash: txHash, transactionIndex: "0x0", blockHash: `0x${"34".repeat(32)}`,
            blockNumber: "0x100", from: account, to: null, cumulativeGasUsed: "0x100000", gasUsed: "0x100000",
            contractAddress: null, logs: [], logsBloom: `0x${"00".repeat(256)}`, status: "0x0", effectiveGasPrice: "0x989680", type: "0x0" },
        };
        return Object.hasOwn(results, method) ? { jsonrpc: "2.0", id, result: results[method] } : { jsonrpc: "2.0", id, error: { code: -32601, message: `Blocked mock RPC: ${method}` } };
      };
      await route.fulfill({ json: Array.isArray(input) ? input.map(reply) : reply(input) });
    });
    await page.addInitScript(({ account, collection, market, wrong, mode, txHash }) => {
      if (market) localStorage.setItem(`rarecognos.deployment.fee25.v1:4441:${account}`, JSON.stringify({ collection }));
      let authorized = false, chain = wrong ? "0x1" : "0x1159";
      const listeners = {};
      window.__requests = [];
      const provider = {
        async request({ method, params }) {
          window.__requests.push({ method, params });
          if (method === "eth_requestAccounts") { authorized = true; return [account]; }
          if (method === "eth_accounts") return authorized ? [account] : [];
          if (method === "eth_chainId") return chain;
          if (method === "wallet_switchEthereumChain") { chain = "0x1159"; for (const fn of listeners.chainChanged || []) fn(chain); return null; }
          if (method === "eth_sendTransaction") {
            if (mode === "revert") return txHash;
            throw Object.assign(Error("Mock wallet rejected"), { code: 4001 });
          }
          throw Error(`Blocked mock wallet method: ${method}`);
        },
        on(event, fn) { (listeners[event] ||= []).push(fn); },
        removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((x) => x !== fn); },
      };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: {
        info: { uuid: "00000000-0000-4000-8000-000000000001", name: "OKX Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "com.okex.wallet" }, provider,
      } }));
      window.addEventListener("eip6963:requestProvider", announce);
      setTimeout(announce, 200);
    }, { account, collection, market, wrong, mode, txHash });
    await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("menuitem", { name: "OKX Wallet", exact: true }).click();
    await page.getByRole("button", { name: /Wallet 0xffd9/i }).waitFor();
    return { page, context };
  }

  let { page, context } = await makePage({ wrong: true });
  await page.getByRole("button", { name: "Switch to LiteForge" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Simulate collection deployment" }).isDisabled(), true);
  await page.getByRole("button", { name: "Switch to LiteForge" }).screenshot({ path: "qa/okx-wrong-network.png" });
  await page.getByRole("button", { name: "Switch to LiteForge" }).click();
  await page.getByText("Wallet balance: 0.1 zkLTC").waitFor();
  await page.getByRole("button", { name: "Simulate collection deployment" }).click();
  await page.getByText("Simulation passed.", { exact: false }).waitFor();
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Deploy RareCognos V2" }) }).screenshot({ path: "qa/okx-collection-simulation.png" });
  assert.equal((await page.evaluate(() => window.__requests)).some((r) => r.method === "eth_sendTransaction"), false);
  await page.getByRole("button", { name: "Confirm deployment in wallet" }).click();
  await page.getByText("Rejected in wallet. No transaction was confirmed.").waitFor();
  console.log("PASS connection, wrong network, switching, mocked 0.1 zkLTC balance, collection simulation and rejected signature");
  await context.close();

  ({ page, context } = await makePage({ market: true }));
  const input = page.getByLabel("Treasury recipient (public address)");
  const simulate = page.getByRole("button", { name: "Simulate marketplace deployment" });
  for (const value of ["", "invalid", "0x0000000000000000000000000000000000000000"]) {
    await input.fill(value); assert.equal(await simulate.isDisabled(), true, `Invalid treasury: ${value}`);
  }
  await input.fill(treasury); await simulate.click();
  await page.getByText(`Treasury: ${treasury}`, { exact: false }).waitFor();
  await page.getByText("Fee: 0.25% (fixed)", { exact: false }).waitFor();
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Deploy RareCognos V2" }) }).screenshot({ path: "qa/okx-market-simulation.png" });
  await page.getByRole("button", { name: "Confirm deployment in wallet" }).click();
  await page.getByText("Rejected in wallet. No transaction was confirmed.").waitFor();
  const requests = await page.evaluate(() => window.__requests);
  const tx = requests.find((r) => r.method === "eth_sendTransaction").params[0];
  const [actualCollection, actualTreasury] = decodeAbiParameters([{ type: "address" }, { type: "address" }], `0x${tx.data.slice(-128)}`);
  assert.equal(actualCollection.toLowerCase(), collection);
  assert.equal(actualTreasury.toLowerCase(), treasury);
  console.log("PASS invalid treasury, market simulation, 0.25% fee and exact displayed constructor address");
  await context.close();

  ({ page, context } = await makePage({ mode: "revert" }));
  await page.getByRole("button", { name: "Simulate collection deployment" }).click();
  await page.getByRole("button", { name: "Confirm deployment in wallet" }).click();
  await page.getByText("Transaction reverted", { exact: false }).waitFor({ timeout: 20000 });
  assert.equal(await page.getByRole("button", { name: "Simulate marketplace deployment" }).count(), 0);
  console.log("PASS mocked reverted transaction does not advance to market");
  await context.close();
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}