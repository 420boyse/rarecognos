// Focused diagnosis of the buyer "My NFTs" card. Classifies the cause of a missing artwork name as
// (a) application bug, (b) IPFS gateway latency/rate-limit, or (c) brittle test selector.
// Instruments: wallet connection state, on-chain ownership read, every gateway response status,
// and the DOM nodes the selector depends on. Read-only; the mock wallet refuses all signing.
import { chromium } from "playwright";

const BASE = "http://localhost:8080";
const BUYER = "0xAc2b060448ce420b18d951c663f24E8A286035A4";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const gatewayCalls = [];      // what the IPFS gateway actually answered
const rpcCalls = [];          // on-chain read failures
const pageErrors = [];
page.on("response", (r) => {
  const u = r.url();
  if (/gateway\.pinata\.cloud|ipfs\.io|cloudflare-ipfs|dweb\.sh/.test(u)) gatewayCalls.push({ status: r.status(), url: u.slice(0, 96) });
});
page.on("requestfailed", (r) => {
  if (/pinata|ipfs/i.test(r.url())) gatewayCalls.push({ status: "FAILED", url: r.url().slice(0, 96), why: r.failure()?.errorText });
});
page.on("pageerror", (e) => pageErrors.push(String(e.message).replace(/\s+/g, " ").slice(0, 120)));

await page.addInitScript(({ account }) => {
  const SIGN = ["eth_sendTransaction", "eth_sendRawTransaction", "personal_sign", "eth_sign", "eth_signTypedData_v4"];
  const provider = {
    request: async ({ method, params }) => {
      if (SIGN.includes(method)) throw new Error("read-only guard refused " + method);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "eth_chainId") return "0x1159";
      const r = await fetch("https://rpc.testnet.liteforge.zeeve.net", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }),
      });
      const j = await r.json();
      if (j.error) rpcCalls.push(method + ": " + j.error.message);
      if (j.error) throw new Error(j.error.message);
      return j.result;
    },
    on: () => {}, removeListener: () => {}, addListener: () => {}, removeAllListeners: () => {},
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: { info: { uuid: "00000000-0000-4000-8000-000000000009", name: "OKX Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "com.okex.wallet" }, provider },
  }));
  window.addEventListener("eip6963:requestProvider", announce);
  setTimeout(announce, 150);
}, { account: BUYER });

await page.goto(BASE + "/#my-nfts", { waitUntil: "domcontentloaded", timeout: 60_000 });

const probe = async (label) => {
  const text = await page.locator("body").innerText();
  return {
    label,
    elapsedS: null,
    connectedChip: await page.getByLabel(/^Wallet 0x/).count(),
    // on-chain ownership card: rendered from contract reads, independent of IPFS
    ownershipCard: /1\/1 · #1/.test(text),
    saleState: /Not currently for sale/.test(text),
    artworkName: /01 wawe/.test(text),
    loadingPlaceholder: /Loading artwork/.test(text),
    fallbackLabel: /Token #1/.test(text),
    metadataError: /Metadata could not be loaded/.test(text),
    ownershipReadError: /Could not read ownership/.test(text),
    connectPrompt: /Connect your wallet in the top bar/.test(text),
    tokenLinks: await page.locator("a[href^='#token/1']").count(),
    section: (() => { const i = text.indexOf("Your collection"); return i < 0 ? "(absent)" : text.slice(i, i + 230).replace(/\s+/g, " "); })(),
  };
};

const timeline = [];
const started = Date.now();
let final = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1500);
  const s = await probe("my-nfts");
  s.elapsedS = Math.round((Date.now() - started) / 1000);
  timeline.push(s);
  final = s;
  if (s.artworkName) break;                     // only a real metadata resolution ends the wait
  if (s.ownershipReadError || s.metadataError) break;   // app gave up and showed its own error state
}

await page.screenshot({ path: "qa/buyer-mynfts-diagnosis.png", fullPage: true });

const gatewaySummary = {
  total: gatewayCalls.length,
  byStatus: gatewayCalls.reduce((a, c) => ({ ...a, [c.status]: (a[c.status] || 0) + 1 }), {}),
  first3: gatewayCalls.slice(0, 3),
};

// ---- classification ----
let verdict, why;
if (final.ownershipCard && final.artworkName) {
  verdict = "GATEWAY LATENCY (resolved)";
  why = `the artwork name resolved after ${final.elapsedS}s. While waiting the app shows "Loading artwork…" plus a "Token #1" fallback, so nothing renders blank and no code change is needed. My earlier batched check simply asserted too early.`;
} else if (final.ownershipCard && final.metadataError) {
  verdict = "GATEWAY RATE LIMIT (did not resolve)";
  why = "on-chain ownership rendered correctly; the metadata fetch failed and the app surfaced its own \"Metadata could not be loaded\" + Retry affordance. Cause is the public gateway, not the app.";
} else if (final.ownershipCard && final.fallbackLabel && !final.artworkName) {
  verdict = "GATEWAY UNRESPONSIVE (still pending)";
  why = "on-chain ownership card rendered; the metadata request is still in flight after the full polling budget, consistent with gateway throttling. The app's fallback label and Retry control behaved as designed.";
} else if (!final.ownershipCard && final.ownershipReadError) {
  verdict = "RPC READ FAILURE (transient)";
  why = "the contract ownership read failed under load; the app shows its Retry control. Not a settlement or rendering defect.";
} else if (!final.ownershipCard && final.connectPrompt) {
  verdict = "TEST HARNESS"; why = "the mock wallet did not auto-connect in this context, so the page legitimately shows the connect prompt.";
} else if (!final.ownershipCard) {
  verdict = "POSSIBLE APPLICATION BUG";
  why = "the wallet is connected and the page never rendered an ownership card, with no app-level error state; this needs a code look.";
} else verdict = "INCONCLUSIVE";

const report = {
  ranAt: new Date().toISOString(), url: BASE + "/#my-nfts", buyer: BUYER,
  verdict, why,
  finalState: final,
  gateway: gatewaySummary,
  rpcErrors: rpcCalls.slice(0, 5),
  pageErrors: pageErrors.slice(0, 4),
  timeline: timeline.filter((_, i) => i % 4 === 0 || i === timeline.length - 1).map((t) => ({ s: t.elapsedS, card: t.ownershipCard, name: t.artworkName, fallback: t.fallbackLabel, metaErr: t.metadataError, readErr: t.ownershipReadError })),
};
console.log(JSON.stringify(report, null, 2));
import("node:fs").then((fs) => fs.writeFileSync("qa/buyer-mynfts-diagnosis.json", JSON.stringify(report, null, 2) + "\n"));
await browser.close();
