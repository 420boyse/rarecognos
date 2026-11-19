// Browser acceptance checks for a local preview with the LiteForge testnet catalog.
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
const origin = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:4194");
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  const page = await browser.newPage();
  await page.goto(new URL("/explore?q=RARE", origin).href);
  page.setDefaultTimeout(15000);
  const listing = page.getByRole("link", { name: /^View RARE, listed/ });
  await listing.waitFor();
  assert.equal(await page.getByText(/Nothing matches/).count(), 0);
  await listing.click();
  await page.waitForURL("**/token/2");
  await page.getByRole("heading", { name: "RARE", exact: true }).waitFor();
  const html = await (await page.request.get(new URL("/token/2", origin).href)).text();
  assert.match(html, /<title>RARE · RareCognos<\/title>/);
  const og = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(og && !og.endsWith("/og.jpg"));
  assert.ok(html.includes(`name="twitter:image" content="${og}"`));
  await page.goto(new URL("/#token/2", origin).href);
  await page.waitForURL("**/token/2");
  await page.goto(new URL("/explore?q=Spire", origin).href);
  await page.getByRole("link", { name: /^Spire Eyed/ }).click();
  await page.waitForURL("**/eyed?piece=04");
  await page.goto(new URL("/explore?q=no-such-art-fixture", origin).href);
  await page.getByText(/Nothing matches/).waitFor();
  const mobile = await browser.newPage({ ...devices["Pixel 7"] });
  await mobile.goto(new URL("/eyed?piece=07", origin).href);
  await mobile.getByText("Mint open", { exact: true }).first().waitFor();
  await mobile.getByRole("button", { name: "Mint Limb", exact: true }).click();
  await mobile.getByRole("button", { name: "Copy page link" }).waitFor();
  const mm = await mobile.getByRole("link", { name: /MetaMask/ }).getAttribute("href");
  assert.ok(mm.endsWith("/eyed?piece=07"));
  assert.ok(await mobile.getByRole("link", { name: /Trust Wallet/ }).isVisible());
  assert.ok(await mobile.getByRole("link", { name: /OKX Wallet/ }).isVisible());
  console.log("PASS live listing search, no-match, piece search, server-rendered share card, legacy link and Android wallet links.");
} finally { await browser.close(); }
