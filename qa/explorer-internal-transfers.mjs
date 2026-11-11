const EXP = "https://explorer.testnet.liteforge.zeeve.net";
const TREASURY = "0x06e53D74751392ee4aC7139f611B8db3f98591f9";
const SELLER = "0xfFd9618E19Fb7f74169f75343550E14b74d19CB3";
const BUYER = "0xfeb935dc86d5549e2a61003dd5f2d52f6f840811";
const probes = [
  ["treasury internal-transactions", `${EXP}/api/v2/addresses/${TREASURY}/internal-transactions`],
  ["seller internal-transactions", `${EXP}/api/v2/addresses/${SELLER}/internal-transactions`],
  ["treasury token-transfers(native)", `${EXP}/api/v2/addresses/${TREASURY}/token-transfers?token_type=NATIVE`],
  ["treasury balance-history", `${EXP}/api/v2/addresses/${TREASURY}/balance-change-history`],
  ["treasury stats", `${EXP}/api/v2/addresses/${TREASURY}/stats`],
  ["tx info (fundBuyer)", `${EXP}/api/v2/transactions/0x377480d23aca3eb54d8e23f4bebc4977fb2be5f2997f2b7051f7891553508a42`],
  ["tx status+logs", `${EXP}/api/v2/transactions/0x377480d23aca3eb54d8e23f4bebc4977fb2be5f2997f2b7051f7891553508a42/status`],
];
for (const [label, url] of probes) {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(25000) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { console.log(`${label.padEnd(34)} HTTP ${r.status}`); continue; }
    if (Array.isArray(j?.items)) {
      console.log(`${label.padEnd(34)} items=${j.items.length}`);
      for (const it of j.items.slice(0, 4)) console.log("     ", JSON.stringify(it).slice(0, 300));
    } else console.log(`${label.padEnd(34)} keys=${Object.keys(j || {}).slice(0, 10).join(",")} :: ${JSON.stringify(j).slice(0, 240)}`);
  } catch (e) { console.log(`${label.padEnd(34)} ERR ${String(e.message).slice(0,80)}`); }
}
