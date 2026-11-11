// Focused local UI test: mocked wallet and RPC never sign or broadcast.
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { decodeAbiParameters } from "viem";

const collection = "0x1111111111111111111111111111111111111111";
const treasury = "0x2222222222222222222222222222222222222222";
const account = "0xffd9618e19fb7f74169f75343550e14b74d19cb3";
const server = spawn("npm", ["run", "nft:deploy:local"], { stdio: "ignore" });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Local deployment server exited before becoming ready");
    try { if ((await fetch("http://127.0.0.1:8080/")).ok) { ready = true; break; } } catch { /* starting */ }
    await delay(300);
  }
  assert.ok(ready, "Local deployment server did not start");
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("**/rpc.testnet.liteforge.zeeve.net/**", async (route) => {
    const requests = JSON.parse(route.request().postData());
    const reply = (r) => ({ jsonrpc: "2.0", id: r.id, result: ({ eth_call: "0x", eth_estimateGas: "0x100000", eth_gasPrice: "0x989680", eth_blockNumber: "0x100" })[r.method] ?? "0x0" });
    await route.fulfill({ json: Array.isArray(requests) ? requests.map(reply) : reply(requests) });
  });
  await page.addInitScript(({ account, collection }) => {
    localStorage.setItem(`rarecognos.deployment.fee25.v1:4441:${account}`, JSON.stringify({ collection }));
    let authorized = false;
    window.__walletRequests = [];
    const provider = {
      request: async ({ method, params }) => {
        window.__walletRequests.push({ method, params });
        if (method === "eth_requestAccounts") { authorized = true; return [account]; }
        if (method === "eth_accounts") return authorized ? [account] : [];
        if (method === "eth_chainId") return "0x1159";
        if (method === "eth_sendTransaction") throw Object.assign(Error("Test wallet rejects all transactions"), { code: 4001 });
        throw Error(`Test wallet blocks ${method}`);
      },
      on() {}, removeListener() {},
    };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: {
      info: { uuid: "00000000-0000-4000-8000-000000000001", name: "OKX Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "com.okex.wallet" }, provider,
    } }));
    window.addEventListener("eip6963:requestProvider", announce);
    setTimeout(announce, 200);
  }, { account, collection });
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: "OKX Wallet", exact: true }).click();
  const input = page.getByLabel("Treasury recipient (public address)");
  const simulate = page.getByRole("button", { name: "Simulate marketplace deployment" });
  await input.waitFor();
  for (const value of ["", "not-an-address", "0x0000000000000000000000000000000000000000"]) {
    await input.fill(value);
    assert.equal(await simulate.isDisabled(), true, `Treasury ${value} must be rejected`);
  }
  await input.fill(treasury);
  assert.equal(await simulate.isEnabled(), true);
  await simulate.click();
  await page.getByText(`Treasury: ${treasury}`, { exact: false }).waitFor();
  await input.fill("invalid");
  assert.equal(await page.getByRole("button", { name: "Confirm deployment in wallet" }).count(), 0);
  await input.fill(treasury);
  await simulate.click();
  await page.getByText(`Treasury: ${treasury}`, { exact: false }).waitFor();
  await page.getByRole("button", { name: "Confirm deployment in wallet" }).click();
  await page.waitForFunction(() => window.__walletRequests.some((r) => r.method === "eth_sendTransaction"));
  const requests = await page.evaluate(() => window.__walletRequests);
  const transaction = requests.find((r) => r.method === "eth_sendTransaction").params[0];
  const [actualCollection, actualTreasury] = decodeAbiParameters([{ type: "address" }, { type: "address" }], `0x${transaction.data.slice(-128)}`);
  assert.equal(actualCollection.toLowerCase(), collection);
  assert.equal(actualTreasury.toLowerCase(), treasury);
  console.log("PASS: treasury validation, review, change invalidation and exact constructor arguments; mock wallet rejected transaction");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}