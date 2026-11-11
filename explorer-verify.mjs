const EXPLORER = "https://explorer.testnet.liteforge.zeeve.net";
console.log(`=== Testing Zeeve Explorer (Etherscan-style): ${EXPLORER} ===`);

const endpoints = [
  { url: `${EXPLORER}/api?module=block&action=blocknumber&tag=latest`, label: "block number" },
  { url: `${EXPLORER}/api?module=proxy&action=eth_blockNumber`, label: "eth_blockNumber" },
  { url: `${EXPLORER}/api?module=proxy&action=eth_chainId`, label: "eth_chainId" },
  { url: `${EXPLORER}/api?module=proxy&action=eth_gasPrice`, label: "eth_gasPrice" },
  { url: `${EXPLORER}/api?module=account&action=balance&address=0x0000000000000000000000000000000000000000&tag=latest`, label: "balance 0x0" },
  { url: `${EXPLORER}/api?module=proxy&action=eth_getBlockByNumber&tag=latest&hex=false`, label: "getBlockByNumber latest" },
];

for (const { url, label } of endpoints) {
  try {
    const resp = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" } });
    const text = await resp.text();
    console.log(`\\n[${label}] ${resp.status}`);
    if (resp.ok) {
      try {
        const data = JSON.parse(text);
        console.log(`  status=${data.status} result=${JSON.stringify(data.result).slice(0, 250)}`);
      } catch (e) { console.log("  body not JSON:", text.slice(0, 200)); }
    } else {
      console.log("  body:", text.slice(0, 300).replace(/\n/g, " "));
    }
  } catch (e) {
    console.log(`\\n[${label}] ERROR: ${e.message.slice(0, 150)}`);
  }
}