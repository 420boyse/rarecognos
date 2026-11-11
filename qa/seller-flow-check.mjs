// Seller-side preparation check on the live LiteForge app. The mock wallet hard-refuses
// personal_sign / eth_sendTransaction / eth_sendRawTransaction, so nothing can be submitted.
import { chromium } from "playwright";
const BASE = "http://localhost:8080";
const SELLER = "0xfFd9618E19Fb7f74169f75343550E14b74d19CB3";
const out = [];
const log = (id, pass, d) => { out.push({ id, pass, d }); console.log(`${pass ? "PASS" : "FAIL"} ${id} — ${d}`); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const blocked = [];
try {
  await page.addInitScript(({ seller }) => {
    const SIGN = ["eth_sendTransaction", "eth_sendRawTransaction", "personal_sign", "eth_sign", "eth_signTypedData_v4"];
    const provider = {
      request: async ({ method, params }) => {
        if (SIGN.includes(method)) { blocked.push(method); throw new Error("QA read-only guard: " + method + " refused"); }
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [seller];
        if (method === "eth_chainId") return "0x1159";
        const r = await fetch("https://rpc.testnet.liteforge.zeeve.net", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) });
        const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
      },
      on: () => {}, removeListener: () => {}, addListener: () => {}, removeAllListeners: () => {},
    };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "00000000-0000-4000-8000-000000000004", name: "OKX Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "com.okex.wallet" }, provider } }));
    window.addEventListener("eip6963:requestProvider", announce); setTimeout(announce, 150);
  }, { seller: SELLER });

  await page.goto(BASE + "/#my-nfts", { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(7000);
  const text = await page.locator("body").innerText();
  log("seller-connected", /0xfFd9/i.test(text), "seller wallet shown in header");
  log("owned-token-visible", /#token\/1|# 1|01 wawe/i.test(text), "My NFTs lists token #1 for the connected seller");

  await page.goto(BASE + "/#token/1", { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(7000);
  const d = await page.locator("body").innerText();
  const controls = {
    priceInput: await page.locator("input").count(),
    approve: await page.getByRole("button", { name: /Approve this token/i }).count(),
    list: await page.getByRole("button", { name: /List artwork|Replace listing/i }).count(),
    cancel: await page.getByRole("button", { name: /Cancel listing/i }).count(),
    revokeToken: await page.getByRole("button", { name: /Revoke this token/i }).count(),
    revokeAll: await page.getByRole("button", { name: /Revoke collection-wide/i }).count(),
  };
  log("list-control", controls.list > 0, `list/replace button present (${JSON.stringify(controls)})`);
  log("cancel-control", controls.cancel > 0, "cancel button present for the active listing");
  log("revoke-controls", controls.revokeToken + controls.revokeAll > 0, "separate revoke affordances present");
  log("permission-active", /Active|Granted/i.test(d), "token approval to the market is read as active from chain");
  let disclosed = "n/a";
  const priceEl = page.locator(".sale-price").first();
  if (await priceEl.count()) disclosed = (await priceEl.innerText()).replace(/\s+/g, " ");
  log("sale-price-disclosed", /0\.01\s*zkLTC/.test(disclosed), `active listing price element reads "${disclosed}"`);

  // Type a candidate price and confirm the UI recomputes fee + proceeds, without submitting.
  const priceBox = page.locator("#token-detail input").first();
  if (await priceBox.count()) {
    await priceBox.fill("0.01");
    await page.waitForTimeout(1500);
    const after = await page.locator("#token-detail").innerText();
    const feeShown = /0\.000025\s*zkLTC/.test(after);
    const proceedsShown = /0\.009975\s*zkLTC/.test(after);
    log("fee-recalculated", feeShown && proceedsShown, `at 0.01 zkLTC the UI shows fee ${feeShown ? "0.000025" : "?"} and proceeds ${proceedsShown ? "0.009975" : "?"} zkLTC`);
  }
  await page.screenshot({ path: "qa/seller-token-detail-prepared.png" });
  log("nothing-signed", blocked.length === 0, `blocked attempts: ${JSON.stringify(blocked)}`);
} catch (e) { log("aborted", false, String(e.message).slice(0, 200)); }
finally { await browser.close(); }
console.log("\n" + (out.every((o) => o.pass) ? "SELLER FLOW: ARMED (no transaction submitted)" : "SELLER FLOW: REVIEW ABOVE ITEMS"));
