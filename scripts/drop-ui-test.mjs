import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// If invoked via Chatbox's Electron-as-Node shim on Windows, re-exec with system Node.exe
if (process.versions.electron && existsSync('C:\\Program Files\\nodejs\\node.exe')) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync('C:\\Program Files\\nodejs\\node.exe', process.argv.slice(1), {
    stdio: 'inherit',
    env,
  });
  process.exit(r.status ?? 1);
}

import { chromium } from 'playwright';
import { parseEther } from 'viem';
import { readFileSync } from 'node:fs';
import { localSetup } from './nft-local.mjs';
import { startUploadServer } from '../upload-service/server.mjs';

const dropArtifact = JSON.parse(readFileSync('artifacts/RareCognosDrop.json', 'utf8'));

const appPort = 8081;
const uploadPort = 8789;
const appOrigin = `http://127.0.0.1:${appPort}`;
const uploadOrigin = `http://127.0.0.1:${uploadPort}`;

const s = await localSetup(8545);
const upload = await startUploadServer({
  demo: true,
  port: uploadPort,
  origins: [appOrigin, `http://localhost:${appPort}`],
});

const vite = spawn(
  process.execPath,
  ['./node_modules/vite/bin/vite.js', 'dev', '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VITE_NFT_LOCAL: 'true',
      VITE_NFT_COLLECTION: s.nft.address,
      VITE_NFT_MARKET: s.market.address,
      VITE_DROP_FACTORY: s.factory.address,
      VITE_UPLOAD_API_URL: uploadOrigin,
      VITE_IPFS_GATEWAY: `${uploadOrigin}/ipfs/`,
    },
  }
);
vite.stderr.on('data', (d) => process.stderr.write(d));

async function waitHttp(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let browser;
try {
  await waitHttp(appOrigin);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('[PAGEERROR]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[CONSOLE ERROR]', msg.text());
  });

  await page.exposeBinding('rpcCall', async (_, { method, params, account = 0 }) => {
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'net_version') return '31337';
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
      return [s.addresses[account]];
    }
    if (method === 'wallet_switchEthereumChain') return null;
    if (method === 'personal_sign') {
      return s.wallets[account].signMessage({ message: { raw: params[0] } });
    }
    if (method === 'eth_sendTransaction' && params?.[0] && !params[0].gas) {
      params[0] = { ...params[0], gas: '0x500000' };
    }
    try {
      return await s.server.provider.request({ method, params });
    } catch (err) {
      console.error('[RPC ERROR]', method, err.message);
      throw err;
    }
  });

  await page.addInitScript((addresses) => {
    const listeners = {};
    window.__testAddresses = addresses;
    window.__testAccount = 0;

    const provider = {
      isMetaMask: true,
      request: (req) => window.rpcCall({ ...req, account: window.__testAccount }),
      on: (event, cb) => {
        (listeners[event] ||= new Set()).add(cb);
      },
      removeListener: (event, cb) => {
        listeners[event]?.delete(cb);
      },
    };

    window.localProvider = provider;
    window.ethereum = provider;
    window.okxwallet = provider;

    window.switchTestAccount = (index) => {
      window.__testAccount = index;
      const next = [window.__testAddresses[index]];
      for (const cb of listeners['accountsChanged'] || []) {
        cb(next);
      }
    };
  }, s.addresses);

  const shortAddr = (addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  // 1. Open Create page & connect Creator wallet (addresses[0])
  await page.goto(`${appOrigin}/`, { waitUntil: 'networkidle' });
  const walletBtn = page.locator('button.wallet-button').first();
  await walletBtn.waitFor({ timeout: 15000 });
  const btnText = await walletBtn.innerText();
  if (/Connect wallet/i.test(btnText)) {
    for (let i = 0; i < 20; i++) {
      await walletBtn.click();
      await page.waitForTimeout(300);
      const menuVisible = await page.locator('[role="menuitem"]').first().isVisible().catch(() => false);
      if (menuVisible) {
        await page.locator('[role="menuitem"]').first().click();
        break;
      }
      const currentText = (await walletBtn.textContent()) || '';
      if (!/Connect wallet/i.test(currentText)) break;
    }
  }
  await page.getByRole('button', { name: new RegExp(shortAddr(s.addresses[0]), 'i') }).waitFor({ timeout: 15000 });

  // Switch to Create view via header navigation
  await page.locator('header a[href="#create"]').click();
  await page.getByRole('button', { name: 'Limited edition' }).waitFor({ timeout: 15000 });

  // 2. Prepare artwork via local IPFS demo upload service
  await page.getByRole('button', { name: 'Limited edition' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'genesis-drop.png',
    mimeType: 'image/png',
    buffer: pngBuffer,
  });
  await page.getByLabel('Work name').fill('Genesis Free Drop');
  await page.getByLabel('Description').fill('End-to-end verified free edition drop.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Upload & prepare NFT' }).click();
  await page.getByText('Artwork prepared. Review it before minting.').waitFor({ timeout: 20000 });

  // 3. Configure & deploy FREE Limited Edition drop (price = 0, maxSupply = 10, limit = 2)
  await page.getByLabel('Collection symbol').fill('GFREE');
  await page.getByLabel('Max supply').fill('10');
  await page.getByLabel('Max mints per wallet').fill('2');
  await page.getByLabel('Mint price (zkLTC)').fill('0');
  const createBtn = page.getByRole('button', { name: 'Create collection' });
  await createBtn.click();

  const freeDropLinkLocator = page.locator('a[href^="#drop/"]').first();
  try {
    await freeDropLinkLocator.waitFor({ timeout: 20000 });
  } catch (e) {
    const statuses = await page.locator('[role="status"]').allInnerTexts();
    const notices = await page.locator('.market-notice').allInnerTexts();
    console.error('[DEBUG STATUS]', statuses, '[DEBUG NOTICES]', notices, '[BTN DISABLED]', await createBtn.isDisabled());
    throw e;
  }
  const freeDropHref = await freeDropLinkLocator.getAttribute('href');
  const freeDropAddress = freeDropHref.replace('#drop/', '');

  // Verify Creator Dashboard (#drops) shows the newly deployed drop
  await page.getByText('0 / 10 minted · Free').waitFor({ timeout: 15000 });

  // 4. Navigate to Free Drop public mint page & switch to Collector wallet (addresses[1])
  await freeDropLinkLocator.click();
  await page.getByRole('heading', { name: '0 / 10 minted' }).waitFor({ timeout: 15000 });
  await page.getByText('Free mint: no RareCognos fee. Collector pays network gas.').waitFor({ timeout: 15000 });

  await page.evaluate(() => window.switchTestAccount(1));
  await page.getByRole('button', { name: new RegExp(shortAddr(s.addresses[1]), 'i') }).waitFor({ timeout: 15000 });

  await page.getByRole('button', { name: 'Mint free edition', exact: true }).click();
  await page.getByRole('heading', { name: '1 / 10 minted' }).waitFor({ timeout: 20000 });
  await page.getByText('2 · yours: 1').waitFor({ timeout: 15000 });

  const freeOwner1 = await s.client.readContract({
    address: freeDropAddress,
    abi: dropArtifact.abi,
    functionName: 'ownerOf',
    args: [1n],
  });
  assert.equal(freeOwner1.toLowerCase(), s.addresses[1].toLowerCase(), 'Collector should own token #1 of free drop');

  // 5. Switch back to Creator (addresses[0]) and deploy a PAID drop (price = 10 zkLTC, maxSupply = 2, limit = 2)
  await page.evaluate(() => window.switchTestAccount(0));
  await page.getByRole('button', { name: new RegExp(shortAddr(s.addresses[0]), 'i') }).waitFor({ timeout: 15000 });
  await page.locator('header a[href="#create"]').click();
  await page.getByRole('button', { name: 'Limited edition' }).click();

  await page.getByLabel('Collection symbol').fill('GPAID');
  await page.getByLabel('Max supply').fill('2');
  await page.getByLabel('Max mints per wallet').fill('2');
  await page.getByLabel('Mint price (zkLTC)').fill('10');
  await page.getByRole('button', { name: 'Create collection' }).click();

  await page.waitForFunction(
    (prevHref) => {
      const links = Array.from(document.querySelectorAll('a[href^="#drop/"]'));
      return links.some((a) => a.getAttribute('href') && a.getAttribute('href') !== prevHref);
    },
    freeDropHref,
    { timeout: 20000 }
  );
  const paidDropLink = page.locator(`a[href^="\#drop/"]:not([href="${freeDropHref}"])`).first();
  const paidDropHref = await paidDropLink.getAttribute('href');
  const paidDropAddress = paidDropHref.replace('#drop/', '');

  // 6. Navigate to Paid Drop page, switch to Collector (addresses[1]), and verify 25 bps fee + creator payment
  await paidDropLink.click();
  await page.getByRole('heading', { name: '0 / 2 minted' }).waitFor({ timeout: 15000 });
  await page.getByText(/0\.025 zkLTC/).waitFor({ timeout: 15000 });
  await page.getByText(/9\.975 zkLTC/).waitFor({ timeout: 15000 });

  await page.evaluate(() => window.switchTestAccount(1));
  await page.getByRole('button', { name: new RegExp(shortAddr(s.addresses[1]), 'i') }).waitFor({ timeout: 15000 });

  const creatorBefore = await s.client.getBalance({ address: s.addresses[0] });
  const treasuryBefore = await s.client.getBalance({ address: s.addresses[2] });

  await page.getByRole('button', { name: 'Mint edition', exact: true }).click();
  await page.getByRole('heading', { name: '1 / 2 minted' }).waitFor({ timeout: 20000 });

  const creatorAfter = await s.client.getBalance({ address: s.addresses[0] });
  const treasuryAfter = await s.client.getBalance({ address: s.addresses[2] });

  assert.equal(treasuryAfter - treasuryBefore, parseEther('0.025'), 'Treasury must receive exact 25 bps (0.25%) fee');
  assert.equal(creatorAfter - creatorBefore, parseEther('9.975'), 'Creator must receive exact 99.75% proceeds');

  // Mint 2nd edition to hit maxSupply (2/2) and verify Sold out state
  await page.getByRole('button', { name: 'Mint edition', exact: true }).click();
  await page.getByRole('heading', { name: '2 / 2 minted' }).waitFor({ timeout: 20000 });
  await page.getByText('Public mint is closed, paused, sold out, or outside its window.').waitFor({ timeout: 10000 });
  const mintBtn = page.getByRole('button', { name: 'Mint edition', exact: true });
  assert.equal(await mintBtn.isDisabled(), true, 'Mint button must be disabled when maxSupply is reached');

  console.log(
    JSON.stringify({
      ok: true,
      freeDropAddress,
      paidDropAddress,
      collector: s.addresses[1],
      feeReceivedWei: String(treasuryAfter - treasuryBefore),
      creatorReceivedWei: String(creatorAfter - creatorBefore),
    })
  );
} finally {
  await browser?.close().catch(() => {});
  vite.kill();
  await upload.close().catch(() => {});
  await s.server.close().catch(() => {});
}
