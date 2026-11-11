// Buyer-side flow preparation. Mock EIP-6963 wallet that hard-refuses every sign/broadcast call.
import { chromium } from "playwright";
const BASE = "http://localhost:8080";
const BUYER = "0xfeb935dc86d5549e2a61003dd5f2d52f6f840811";
const out = [];
const log = (id, pass, d) => { out.push({ id, pass, d }); console.log(`${pass ? "PASS" : "FAIL"} ${id} — ${d}`); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
page.on("pageerror", e => errs.push(e.message));
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
try {
  await page.addInitScript(({ buyer }) => {
    const SIGN = ["eth_sendTransaction","eth_sendRawTransaction","personal_sign","eth_sign","eth_signTypedData","eth_signTypedData_v4","eth_signTypedData_v3"];
    const provider = {
      request: async ({ method, params }) => {
        if (SIGN.includes(method)) { window.__blocked = (window.__blocked||[]).concat([method]); throw new Error("QA read-only guard: " + method + " refused"); }
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [buyer];
        if (method === "eth_chainId") return "0x1159";
        if (method === "net_version") return "4441";
        const r = await fetch("https://rpc.testnet.liteforge.zeeve.net", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ jsonrpc:"2.0", id:1, method, params: params||[] }) });
        const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
      },
      on: () => {}, removeListener: () => {}, addListener: () => {}, removeAllListeners: () => {},
    };
    window.__blocked = [];
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid:"00000000-0000-4000-8000-000000000002", name:"OKX Wallet", icon:"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns:"com.okex.wallet" }, provider } }));
    window.addEventListener("eip6963:requestProvider", announce); setTimeout(announce, 150);
  }, { buyer: BUYER });

  await page.goto(BASE + "/#token/1", { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(6000);
  const text = await page.locator("body").innerText();
  log("buyer-connected", /0xfeb9/i.test(text), "header shows buyer wallet 0xfeb9…");
  log("buyer-not-seller-view", !/Cancel listing/.test(text), "buyer does not see seller-only cancel control");
  const buyBtn = page.getByRole("button", { name: /Buy for/i });
  const n = await buyBtn.count();
  log("buy-control-rendered", n > 0, `buy control count=${n}`);
  if (n) {
    const label = (await buyBtn.first().innerText()).replace(/\s+/g, " ");
    log("buy-price-0.01", /0\.01\s*zkLTC/.test(label), `wallet-facing label: "${label}"`);
    const disabled = await buyBtn.first().isDisabled();
    log("buy-enabled", !disabled, `disabled=${disabled}`);
  }
  log("fee-disclosed", /0\.000025\s*zkLTC/.test(text) && /0\.009975\s*zkLTC/.test(text), "UI previews fee 0.000025 and seller proceeds 0.009975 zkLTC");
  const preview = page.locator("#token-detail img, #token-detail").first();
  await preview.screenshot({ path: "qa/buyer-token-detail.png" }).catch(() => {});
  await page.screenshot({ path: "qa/buyer-token-detail.png" });
  // Click into the review step only if a confirmation stage exists, never confirming.
  const blocked = await page.evaluate(() => window.__blocked || []);
  log("no-signing-performed", blocked.length === 0, `blocked sign attempts: ${JSON.stringify(blocked)}`);
  log("clean-console", errs.length === 0, errs.slice(0,3).join(" | ").slice(0,200) || "clean");
} catch (e) { log("aborted", false, String(e.message).slice(0,200)); }
finally { await browser.close(); }
console.log("\n" + (out.every(o=>o.pass) ? "BUYER FLOW: ARMED (no transaction submitted)" : "BUYER FLOW: NEEDS REVIEW"));
