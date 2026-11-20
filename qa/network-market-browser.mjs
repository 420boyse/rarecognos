import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import ganache from "ganache";
import { concatHex, encodeDeployData, encodeFunctionData } from "viem";
const url = new URL(process.env.QA_ORIGIN || "http://127.0.0.1:4300");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
const release = JSON.parse(fs.readFileSync("config/liteforge-market.json"));
const { initCode } = JSON.parse(fs.readFileSync("public/contracts/LiteForgeMarket.json"));
const nft = JSON.parse(fs.readFileSync("public/contracts/RareCognos.json"));
const provider = ganache.provider({
  chain: { chainId: 4441, hardfork: "shanghai" },
  logging: { quiet: true },
});
const rpc = (method, params = []) => provider.request({ method, params });
const [seller, buyer] = await rpc("eth_accounts");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
async function send(tx) {
  const h = await rpc("eth_sendTransaction", [{ from: seller, gas: "0x989680", ...tx }]);
  const receipt = await rpc("eth_getTransactionReceipt", [h]);
  assert.equal(receipt.status, "0x1");
  return receipt;
}
try {
  await rpc("evm_setAccountCode", [
    release.proxy,
    "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3",
  ]);
  await send({ to: release.proxy, data: concatHex([release.salt, initCode]) });
  const { contractAddress: collection } = await send({ data: encodeDeployData(nft) });
  await send({
    to: collection,
    data: encodeFunctionData({ ...nft, functionName: "mint", args: ["ipfs://bafybrowsertest"] }),
  });
  const token = { address_hash: collection, name: "Independent collection", type: "ERC-721" };
  const item = {
    id: "1",
    token,
    token_type: "ERC-721",
    metadata: {
      name: "Independent artwork",
      image: "https://rarecognos.com/art/midnight-rogues/001.jpg",
    },
  };
  async function pageFor(address, width) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 } });
    await ctx.exposeBinding("qaWallet", async (_, { method, params }) => {
      if (["eth_accounts", "eth_requestAccounts"].includes(method)) return [address];
      if (method === "eth_sendTransaction") return rpc(method, [{ ...params[0], gas: "0x989680" }]);
      return rpc(method, params);
    });
    await ctx.addInitScript(() => {
      window.ethereum = {
        isMetaMask: true,
        request: (args) => window.qaWallet(args),
        on() {},
        removeListener() {},
      };
    });
    await ctx.route("https://rpc.testnet.liteforge.zeeve.net/**", async (route) => {
      const body = route.request().postDataJSON();
      async function answer({ id, method, params }) {
        try {
          return { jsonrpc: "2.0", id, result: await rpc(method, params) };
        } catch (e) {
          return { jsonrpc: "2.0", id, error: { code: e.code || -32000, message: e.message } };
        }
      }
      await route.fulfill({
        json: Array.isArray(body) ? await Promise.all(body.map(answer)) : await answer(body),
      });
    });
    await ctx.route("https://explorer.testnet.liteforge.zeeve.net/api/v2/**", (r) =>
      r.fulfill({
        json: r.request().url().includes("/nft") ? { items: [item], next_page_params: null } : item,
      }),
    );
    const p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    return p;
  }
  async function connect(p) {
    await p.waitForLoadState("networkidle");
    await p.getByRole("button", { name: "Connect wallet", exact: true }).first().click();
    await p
      .getByRole("button", { name: /connect in this browser/i })
      .first()
      .click();
  }
  const p = await pageFor(seller, 1280);
  await p.goto(new URL("/#my-nfts", url).href);
  await connect(p);
  await p.getByRole("link", { name: /Independent artwork/ }).click();
  await p.getByLabel("Listing price").fill("0.003");
  await p.getByRole("button", { name: "Approve this NFT" }).click();
  await p.getByRole("button", { name: "List one NFT" }).click();
  await p.getByText("This wallet does not hold this NFT.").waitFor();
  await p.goto(new URL("/network-market?mine=1", url).href);
  await p.getByRole("link", { name: /View Independent artwork/ }).click();
  await p.getByRole("button", { name: "Cancel listing" }).click();
  await p.getByText(/Listing closed/).waitFor();
  await p.goto(new URL("/#my-nfts", url).href);
  await p.getByRole("link", { name: /Independent artwork/ }).click();
  await p.getByLabel("Listing price").fill("0.003");
  await p.getByRole("button", { name: "Approve this NFT" }).click();
  await p.getByRole("button", { name: "List one NFT" }).click();
  await p.getByRole("link", { name: "Open your listing" }).click();
  await p.waitForURL("**/network-market?sale=L2");

  const b = await pageFor(buyer, 390);
  await b.goto(new URL("/explore?q=Independent", url).href);
  await b.getByRole("link", { name: /View Independent artwork/ }).click();
  await b.getByText("0.003 test zkLTC · Listed", { exact: true }).waitFor();
  await connect(b);
  await b.getByRole("button", { name: /Buy for 0.003/ }).click();
  await b.getByText(/Listing closed/).waitFor();
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log(
    "PASS desktop wallet discovery, approval, listing and management; mobile public discovery, purchase and closed receipt.",
  );
} finally {
  await browser.close();
  await provider.disconnect();
}
