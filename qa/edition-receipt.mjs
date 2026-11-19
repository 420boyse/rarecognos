// Run against a local production preview. All wallet and chain calls stay in Ganache.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ganache from "ganache";
import { chromium } from "playwright";
import { encodeDeployData } from "viem";

const app = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:4194");
assert.ok(["localhost", "127.0.0.1"].includes(app.hostname));
const provider = ganache.provider({ chain: { chainId: 4441, hardfork: "shanghai" }, logging: { quiet: true } });
const call = (method, params = []) => provider.request({ method, params });
const [wallet, treasury] = await call("eth_accounts");
const contract = JSON.parse(readFileSync("config/eyed.json")).address;
const artifact = JSON.parse(readFileSync("public/contracts/RareCognosEyed.json"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  const deployHash = await call("eth_sendTransaction", [{ from: wallet, gas: "0x989680", data: encodeDeployData({
    ...artifact, args: [wallet, treasury, Array(9).fill("ipfs://fixture-artwork")],
  }) }]);
  const deployed = await call("eth_getTransactionReceipt", [deployHash]);
  assert.equal(deployed.status, "0x1");
  const code = await call("eth_getCode", [deployed.contractAddress, "latest"]);
  await call("evm_setAccountCode", [contract, code]);
  const context = await browser.newContext();
  let submissions = 0;
  await context.exposeBinding("localWalletRequest", async (_, { method, params }) => {
    if (["eth_accounts", "eth_requestAccounts"].includes(method)) return [wallet];
    if (method === "eth_sendTransaction") {
      submissions++;
      assert.equal(params[0].to.toLowerCase(), contract.toLowerCase());
      return call(method, [{ ...params[0], gas: "0x7a120" }]);
    }
    return call(method, params);
  });
  await context.addInitScript(() => {
    window.ethereum = { isMetaMask: true, request: (args) => window.localWalletRequest(args), on() {}, removeListener() {} };
  });
  await context.route("https://rpc.testnet.liteforge.zeeve.net/**", async (route) => {
    const body = route.request().postDataJSON();
    async function respond({ id, method, params }) {
      try { return { id, jsonrpc: "2.0", result: await call(method, params) }; }
      catch (e) { return { id, jsonrpc: "2.0", error: { code: e.code || -32000, message: e.message } }; }
    }
    await route.fulfill({ json: Array.isArray(body) ? await Promise.all(body.map(respond)) : await respond(body) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  await page.goto(new URL("/eyed?piece=02", app).href);
  await page.getByText("Mint open", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: /connect in this browser/i }).first().click();
  await page.getByRole("button", { name: "Mint Lobe", exact: true }).waitFor();
  await call("miner_stop");
  await page.getByRole("button", { name: "Mint Lobe", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("rarecognos.transactions.v2") || "[]").some(r => r.status === "pending"));
  await page.getByRole("button", { name: "Next work" }).click();
  await page.getByRole("heading", { name: "Notch", exact: true }).waitFor();
  await call("evm_mine");
  const dialog = page.getByRole("dialog", { name: "Mint confirmed" });
  // Receipt polling observes new heads. Advance the isolated chain as a live miner would.
  const mining = setInterval(() => void call("evm_mine"), 1000);
  try {
    await dialog.waitFor({ timeout: 30000 });
  } finally {
    clearInterval(mining);
  }
  assert.match(await dialog.innerText(), /Lobe #101/);
  assert.equal(await dialog.getByRole("link", { name: "View minted token" }).getAttribute("href"),
    `https://explorer.testnet.liteforge.zeeve.net/token/${contract}/instance/101`);
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByRole("button", { name: "Mint Notch", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("rarecognos.transactions.v2") || "[]").some(r => r.status === "pending"));
  await page.reload();
  await call("evm_mine");
  await page.getByRole("button", { name: "Recheck receipt", exact: true }).click();
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /Notch #201/);
  assert.equal(submissions, 2);
  console.log("PASS receipt stays with the submitted piece, links its token, and survives reload without resending.");
} finally {
  await browser.close();
  await provider.disconnect();
}
