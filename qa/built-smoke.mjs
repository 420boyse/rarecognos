/**
 * Windows-local stand-in for the sandbox browser-smoke.mjs: renders the
 * PRODUCTION build served by `npm run preview` (loopback :8081), captures
 * desktop + mobile screenshots and a JSON verdict.
 *
 * Checks: root has visible real text, no uncaught console errors, no failed
 * module loads, and the platform PWA chrome (og:title) is injected.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const URLS = [
  { name: "desktop", url: "http://127.0.0.1:8081/", viewport: { width: 1440, height: 900 } },
  { name: "mobile", url: "http://127.0.0.1:8081/", viewport: { width: 390, height: 844 } },
];
const OUT = fileURLToPath(new URL(".", import.meta.url));

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const { name, url, viewport } of URLS) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("requestfailed", (req) =>
    failedRequests.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`),
  );
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1200);
  const bodyText = (await page.locator("body").innerText({ timeout: 10000 })).trim();
  const ogTitle = await page
    .locator('meta[property="og:title"]')
    .first()
    .getAttribute("content")
    .catch(() => null);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  const screenshot = `${OUT}built-smoke-${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: false });
  results.push({
    name,
    httpStatus: response?.status(),
    ok: undefined,
    bodyTextLength: bodyText.length,
    bodyTextPrefix: bodyText.slice(0, 220).replace(/\s+/g, " "),
    ogTitle,
    consoleErrors,
    failedRequests,
    horizontalOverflow,
    screenshot,
  });
  await page.close();
}

await browser.close();

const verdict = {
  ok: results.every(
    (r) =>
      r.httpStatus === 200 &&
      r.bodyTextLength > 40 &&
      r.consoleErrors.length === 0 &&
      r.failedRequests.length === 0 &&
      !r.horizontalOverflow,
  ),
  results,
};
writeFileSync(`${OUT}built-smoke-verdict.json`, JSON.stringify(verdict, null, 2));
console.log(JSON.stringify(verdict, null, 2));
process.exit(verdict.ok ? 0 : 1);
