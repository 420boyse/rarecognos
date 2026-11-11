// Local browser smoke: mock EIP-6963 provider never signs or broadcasts.
import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));
  page.on("console", (message) => { if (message.type() === "error") console.log("CONSOLE ERROR:", message.text()); });
  await page.addInitScript(() => {
    let authorized = false;
    const provider = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") {
          authorized = true;
          return ["0xffd9618e19fb7f74169f75343550e14b74d19cb3"];
        }
        if (method === "eth_accounts") return authorized ? ["0xffd9618e19fb7f74169f75343550e14b74d19cb3"] : [];
        if (method === "eth_chainId") return "0x1159";
        if (method === "wallet_switchEthereumChain") return null;
        throw Error(`Mock blocks ${method}`);
      },
      on: () => {},
      removeListener: () => {},
    };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: { info: { uuid: "00000000-0000-4000-8000-000000000001", name: "OKX Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "com.okex.wallet" }, provider },
    }));
    window.addEventListener("eip6963:requestProvider", announce);
    setTimeout(announce, 200);
  });
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("menuitem", { name: "OKX Wallet", exact: true }).click();
  await page.getByRole("button", { name: /Wallet 0xffd9/i }).waitFor();
  await page.getByText("Local development only", { exact: false }).waitFor();
  if (!(await page.getByRole("button", { name: "Simulate collection deployment" }).isEnabled()))
    throw Error("OKX deployment simulation button is not enabled");
  console.log("PASS: EIP-6963 OKX discovery, connection and local-only deployment gate; no transaction requested");
} finally {
  await browser.close();
}