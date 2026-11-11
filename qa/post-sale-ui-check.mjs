// Post-sale UI confirmation on the live public app.
// Harness rule learned the hard way: the mock wallet must be CONNECTED EXPLICITLY (the app shows a
// connector menu whenever more than one connector is discovered). Relying on auto-connect made the
// "My NFTs" case silently render the signed-out state and looked like an application bug.
// Every classification here is evidence-based: gateway response codes, connection state and the
// app's own error states are all reported.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const BUYER = "0xAc2b060448ce420b18d951c663f24E8A286035A4";
const SELLER = "0xfFd9618E19Fb7f74169f75343550E14b74d19CB3";
const RPC = "https://rpc.testnet.liteforge.zeeve.net";

const walletInit = ({ account }) => {
  const SIGN = ["eth_sendTransaction", "eth_sendRawTransaction", "personal_sign", "eth_sign", "eth_signTypedData_v4"];
  const provider = {
    request: async ({ method, params }) => {
      if (SIGN.includes(method)) throw new Error("read-only guard refused " + method);
      // Standard wallet semantics: nothing exposed until the user connects.
      if (method === "eth_requestAccounts") { window.__connected = true; return [account]; }
      if (method === "eth_accounts") return window.__connected ? [account] : [];
      if (method === "eth_chainId") return "0x1159";
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    },
    on: () => {}, removeListener: () => {}, addListener: () => {}, removeAllListeners: () => {},
  };
  window.__connected = false;
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: { info: { uuid: "00000000-0000-4000-8000-000000000009", name: "OKX Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "com.okex.wallet" }, provider },
  }));
  window.addEventListener("eip6963:requestProvider", announce);
  setTimeout(announce, 150);
};

const browser = await chromium.launch();
const cases = [];

// Connect through the real UI. Tolerant by design: the header renders a plain "Connect wallet"
// button when only one connector is discovered and a menu when several are, so neither shape may
// be assumed. Never asserts on connector labels.
const connectAs = async (page, address) => {
  const chip = page.getByLabel(new RegExp("^Wallet " + address.slice(0, 6), "i"));
  if (await chip.count()) return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const btn = page.getByRole("button", { name: "Connect wallet" }).first();
    if (await btn.count()) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(700);
      const items = page.getByRole("menuitem");
      if (await items.count()) {
        const okx = items.filter({ hasText: /^OKX Wallet$/ });
        await (await okx.count() ? okx.first() : items.first()).click().catch(() => {});
      }
    }
    if (await chip.waitFor({ timeout: 12_000 }).then(() => true).catch(() => false)) return true;
  }
  return false;
};

const run = async (label, address, hash, expect) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [], gateway = [], rpcErrs = [];
  page.on("response", (r) => { if (/pinata\.cloud|ipfs\.io|cloudflare-ipfs|dweb\.sh/.test(r.url())) gateway.push(r.status()); });
  page.on("requestfailed", (r) => { if (/pinata|ipfs/i.test(r.url())) gateway.push("failed"); });
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().replace(/\s+/g, " ").slice(0, 150)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e.message).replace(/\s+/g, " ").slice(0, 150)));

  if (address) {
    await page.addInitScript(walletInit, { account: address });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3000); // let EIP-6963 discovery settle
    const connected = await connectAs(page, address);
    if (!connected) { cases.push({ label, pass: false, detail: "HARNESS: mock wallet could not connect" }); console.log(`FAIL ${label} — harness could not connect the mock wallet`); await ctx.close(); return false; }
  }
  await page.goto(BASE + hash, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (address) { await page.waitForTimeout(2500); await connectAs(page, address); }
  const t0 = Date.now();
  let ok = { pass: false, detail: "not evaluated" }, text = "";
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    text = await page.locator("body").innerText();
    const buyBtn = await page.getByRole("button", { name: /Buy for/i }).count();
    const chip = await page.getByLabel(/^Wallet 0x/).count();
    ok = expect(text, buyBtn, chip);
    if (ok.pass) break;
    // stop early on an app-level error state so it is classified instead of timed out
    if (/Could not read ownership|Metadata could not be loaded/.test(text)) break;
  }
  const counts = gateway.reduce((a, s) => ({ ...a, [s]: (a[s] || 0) + 1 }), {});
  ok.detail += `\n      connected=${/0x/.test(text) ? "see below" : "?"} walletChip=${await page.getByLabel(/^Wallet 0x/).count()} gateway=${JSON.stringify(counts)} after ${Math.round((Date.now() - t0) / 1000)}s errors=${errs.length}`;
  if (errs.length) ok.detail += `\n      console: ${errs.slice(0, 2).join(" || ").slice(0, 220)}`;
  await page.screenshot({ path: `qa/post-sale-${label}.png`, fullPage: true });
  cases.push({ label, ...ok });
  console.log(`${ok.pass ? "PASS" : "FAIL"} ${label} — ${ok.detail}`);
  await ctx.close();
  return ok.pass;
};

let all = true;
all = (await run("guest-explore", null, "/", (t, b) => ({
  pass: b === 0 && /no active sales/i.test(t),
  detail: `guest Explore: buy buttons=${b}, "no active sales"=${/no active sales/i.test(t)}`,
})) && all);

all = (await run("buyer-detail-no-selfbuy", BUYER, "/#token/1", (t, b, chip) => ({
  pass: chip === 1 && b === 0,
  detail: `buyer #token/1: walletChip=${chip}, buy button=${b} (0 correct: the market rejects seller==buyer)`,
})) && all);

all = (await run("buyer-my-nfts", BUYER, "/#my-nfts", (t, b, chip) => {
  const card = /1\/1 · #1/.test(t);
  const signedOut = /Connect your wallet in the top bar/.test(t);
  const readErr = /Could not read ownership/.test(t);
  const metaErr = /Metadata could not be loaded/.test(t);
  const cls = card && /01 wawe/.test(t) ? "ownership + IPFS name resolved"
    : card && /Token #1/.test(t) ? "ownership rendered, name still on the gateway fallback"
    : signedOut ? "HARNESS: wallet not connected (signed-out state), not an app defect"
    : readErr ? "RPC ownership read failed (app offers Retry)"
    : metaErr ? "metadata failed (app offers Retry)" : "no card, no app error state";
  return {
    pass: chip === 1 && card && /Not currently for sale/.test(t),
    detail: `walletChip=${chip} ownershipCard=${card} nameOrFallback="${/01 wawe/.test(t) ? "01 wawe (IPFS)" : /Token #1/.test(t) ? "Token #1 (fallback)" : "absent"}" saleState=${/Not currently for sale/.test(t)} -> ${cls}`,
  };
}) && all);

all = (await run("seller-no-longer-owns", SELLER, "/#my-nfts", (t, b, chip) => ({
  pass: chip === 1 && !/1\/1 · #1/.test(t),
  detail: `walletChip=${chip} seller ownership card for token #1 present=${/1\/1 · #1/.test(t)} (must be false)`,
})) && all);

await browser.close();
const report = { ranAt: new Date().toISOString(), base: BASE, buyer: BUYER, seller: SELLER, cases, allPass: cases.every((c) => c.pass) };
fs.writeFileSync("qa/post-sale-ui-verdict.json", JSON.stringify(report, null, 2) + "\n");
console.log("\n" + (report.allPass ? "UI POST-SALE STATE: PASS" : "UI POST-SALE STATE: SEE CLASSIFICATIONS ABOVE") + " — saved qa/post-sale-ui-verdict.json");
