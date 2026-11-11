// Public-app browser verification. Read-only: the mock EIP-6963 wallet refuses every signing and
// broadcast method, so this run cannot submit a transaction even by accident.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const SELLER = "0xffd9618e19fb7f74169f75343550e14b74d19cb3";
const results = [];
const rec = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS " : "FAIL "} ${id} — ${detail}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("CONSOLE " + m.text()); });
const blockedAttempts = [];
try {
  await page.addInitScript(
    ({ seller }) => {
      const FORBIDDEN = [
        "eth_sendTransaction", "eth_sendRawTransaction", "personal_sign", "eth_sign",
        "eth_signTypedData", "eth_signTypedData_v4", "eth_signTypedData_v3", "db_sign",
      ];
      const NON_TRANSACTIONAL = [
        // Wallet connection handshake / display helpers. These are not value transfers or signatures.
        "wallet_requestPermissions", "wallet_getPermissions", "wallet_watchAsset",
        "wallet_switchEthereumChain", "wallet_revokePermissions",
      ];
      const provider = {
        request: async ({ method, params }) => {
          if (FORBIDDEN.includes(method)) {
            window.__signingAttempt = (window.__signingAttempt || []).concat([method]);
            throw new Error(`QA guard: ${method} is not permitted in read-only verification`);
          }
          if (NON_TRANSACTIONAL.includes(method)) {
            window.__handshake = (window.__handshake || []).concat([method]);
            return method === "wallet_getPermissions" || method === "wallet_requestPermissions"
              ? [{ parentCapability: "eth_accounts" }]
              : null;
          }
          // Real wallet semantics: no exposed accounts until the user connects.
          if (method === "eth_requestAccounts") { window.__connected = true; return [seller]; }
          if (method === "eth_accounts") return window.__connected ? [seller] : [];
          if (method === "eth_chainId") return "0x1159";
          if (method === "net_version") return "4441";
          if (method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
          if (method === "wallet_revokePermissions") return null;
          // Read-only JSON-RPC passthrough to the public LiteForge RPC.
          const res = await fetch("https://rpc.testnet.liteforge.zeeve.net", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }),
          });
          const j = await res.json();
          if (j.error) throw new Error(j.error.message || "rpc error");
          return j.result;
        },
        on: () => {}, removeListener: () => {}, addListener: () => {}, removeAllListeners: () => {},
      };
      window.__signingAttempt = [];
      window.__handshake = [];
      const announce = () =>
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "00000000-0000-4000-8000-000000000001",
              name: "OKX Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
              rdns: "com.okex.wallet",
            },
            provider,
          },
        }));
      window.addEventListener("eip6963:requestProvider", announce);
      window.okxwallet = provider; // legacy injected target
      setTimeout(announce, 150);
    },
    { seller: SELLER },
  );

  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90_000 });

  // 1. Public app, not the deployment console.
  const deployConsole = await page.getByRole("heading", { name: "Deploy RareCognos V2" }).count();
  rec("public-app", deployConsole === 0, `deployment-console headings: ${deployConsole} (must be 0)`);

  // 2. Verified contracts loaded, live chain reads rendered in Explore.
  const explore = page.getByRole("heading", { name: "Available to collect" });
  await explore.waitFor({ timeout: 60_000 });
  const bodyText = await page.locator("body").innerText();
  const unconfigured = /Trading opens after the verified V2 contracts are deployed/.test(bodyText);
  rec("contracts-configured", !unconfigured, "app is NOT in the unconfigured gate state");
  const hasPrice = /0\.01\s*zkLTC/.test(bodyText);
  rec("live-listing-visible", hasPrice, `active listing price 0.01 zkLTC present in Explore: ${hasPrice}`);
  const artworkCount = await page.locator("#explore a[href^='#token/']").count();
  rec("listing-cards", artworkCount > 0, `${artworkCount} token link(s) rendered from live RPC batch reads`);

  // 3. Token detail reads on-chain metadata + IPFS image.
  await page.goto(BASE + "/#token/1", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(4000);
  const detail = await page.locator("body").innerText();
  rec("token-detail", /01 wawe/.test(detail), "token #1 metadata name resolved from IPFS");
  rec("token-creator", /0xfFd9618E19Fb7f74169f75343550E14b74d19CB3/i.test(detail), "creator shown on detail");

  // 4. OKX Wallet discovery + connection (no signing).
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.evaluate(() => { window.__connected = false; });
  const connectButton = page.getByRole("button", { name: "Connect wallet" }).first();
  await connectButton.waitFor({ timeout: 45_000 });
  await connectButton.click();
  const okxItem = page.getByRole("menuitem", { name: "OKX Wallet", exact: true });
  const okxVisible = await okxItem.count();
  const menuItems = await page.getByRole("menuitem").allInnerTexts();
  rec("okx-discovered", okxVisible > 0, `connect menu offers [${menuItems.join(", ")}]`);
  if (okxVisible) {
    await okxItem.click();
    await page.getByLabel(/^Wallet 0x/).waitFor({ timeout: 30_000 });
    const chip = await page.getByLabel(/^Wallet 0x/).first().innerText();
    rec("okx-connected", /ffd9/i.test(chip), `connected chip on chain 4441: ${chip.replace(/\s+/g, " ")}`);
  }

  // 5. Create form + upload service reachable from the browser origin.
  await page.goto(BASE + "/#create", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3000);
  const create = await page.getByRole("heading", { name: "Create an NFT" }).count();
  rec("create-form", create > 0, `Create section rendered: ${create}`);
  const createText = await page.locator("body").innerText();
  const uploadOk = !/upload storage is unavailable|storage unavailable|Retry upload service/i.test(createText);
  rec("upload-service-ui", uploadOk, "Create form does not report upload storage unavailable");
  const fileInput = await page.locator("#create input[type=file]").count();
  rec("artwork-input", fileInput > 0, `artwork file input present: ${fileInput}`);

  const attempts = await page.evaluate(() => window.__signingAttempt || []);
  const handshake = await page.evaluate(() => window.__handshake || []);
  rec("no-signing-attempt", attempts.length === 0,
    `sign/broadcast attempts: ${JSON.stringify(attempts)}; non-transactional handshake calls observed: ${JSON.stringify([...new Set(handshake)])}`);

  await page.screenshot({ path: "qa/public-app-create.png", fullPage: false });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "qa/public-app-explore.png", fullPage: false });

  const real = consoleErrors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e));
  rec("clean-console", real.length === 0, real.length ? real.slice(0, 4).join(" | ").slice(0, 400) : "no uncaught console errors");
} catch (e) {
  rec("aborted", false, String(e.message).slice(0, 300));
  await page.screenshot({ path: "qa/public-app-failure.png" }).catch(() => {});
} finally {
  await browser.close();
}
const verdict = { ranAt: new Date().toISOString(), base: BASE, mode: "public app (read-only)", results,
  pass: results.every((r) => r.pass) };
fs.writeFileSync("qa/public-app-verdict.json", JSON.stringify(verdict, null, 2) + "\n");
console.log("\n" + (verdict.pass ? "PUBLIC APP CHECK: PASS" : "PUBLIC APP CHECK: FAIL"));
process.exit(verdict.pass ? 0 : 1);
