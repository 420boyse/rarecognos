import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { decodeDeployData } from "viem";

const collection = "0x1111111111111111111111111111111111111111";
const treasury = "0x1234567890123456789012345678901234567890";
const account = "0xffd9618e19fb7f74169f75343550e14b74d19cb3";
const artifact = JSON.parse(await readFile("artifacts/RareCognosMarket.json", "utf8"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  let simulatedData;
  await page.route("https://rpc.testnet.liteforge.zeeve.net/**", async (route) => {
    const input = route.request().postDataJSON();
    const respond = (call) => {
      if (call.method === "eth_call") simulatedData = call.params[0].data;
      const results = { eth_call: "0x", eth_estimateGas: "0x186a0", eth_gasPrice: "0x989680", eth_chainId: "0x1159", eth_blockNumber: "0x1" };
      if (!(call.method in results)) throw Error(`Unexpected RPC method ${call.method}`);
      return { jsonrpc: "2.0", id: call.id, result: results[call.method] };
    };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(Array.isArray(input) ? input.map(respond) : respond(input)) });
  });
  await page.addInitScript(({ collection, account }) => {
    localStorage.setItem(`rarecognos.deployment.fee25.v1:4441:${account}`, JSON.stringify({ collection }));
    let authorized = false;
    const provider = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") { authorized = true; return [account]; }
        if (method === "eth_accounts") return authorized ? [account] : [];
        if (method === "eth_chainId") return "0x1159";
        throw Error(`Wallet request forbidden: ${method}`);
      },
      on: () => {}, removeListener: () => {},
    };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: { info: { uuid: "00000000-0000-4000-8000-000000000001", name: "OKX Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "com.okex.wallet" }, provider },
    }));
    window.addEventListener("eip6963:requestProvider", announce);
    setTimeout(announce, 200);
  }, { collection, account });
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: "OKX Wallet", exact: true }).click();
  const input = page.getByLabel("Treasury recipient (public address)");
  const simulate = page.getByRole("button", { name: "Simulate marketplace deployment" });
  await input.waitFor();
  assert.equal(await input.getAttribute("required"), "");
  assert.equal(await simulate.isDisabled(), true);
  for (const value of ["invalid", "0x0000000000000000000000000000000000000000"]) {
    await input.fill(value);
    assert.equal(await simulate.isDisabled(), true);
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(await page.getByRole("button", { name: "Confirm deployment in wallet" }).count(), 0);
  }
  await input.fill(treasury);
  await simulate.click();
  await page.getByRole("button", { name: "Confirm deployment in wallet" }).waitFor();
  const displayed = await page.locator(".permission-confirm").innerText();
  assert.ok(displayed.includes(`Treasury: ${treasury}`));
  const decoded = decodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, data: simulatedData });
  assert.equal(decoded.args[0].toLowerCase(), collection.toLowerCase());
  assert.equal(decoded.args[1].toLowerCase(), treasury.toLowerCase());
  await input.fill("not-an-address");
  assert.equal(await simulate.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Confirm deployment in wallet" }).count(), 0);
  console.log("PASS treasury validation, displayed constructor argument, and stale-review blocking (no signing)");
} finally {
  await browser.close();
}