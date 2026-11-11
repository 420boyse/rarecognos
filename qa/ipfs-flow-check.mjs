import { createPublicClient, http } from "viem";
import fs from "node:fs";
const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const cfg = JSON.parse(fs.readFileSync("config/liteforge.json", "utf8"));
const nftAbi = JSON.parse(fs.readFileSync("artifacts/RareCognos.json", "utf8")).abi;
const client = createPublicClient({ transport: http(RPC, { timeout: 30_000 }) });
const uri = await client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "tokenURI", args: [1n] });
const creator = await client.readContract({ address: cfg.collection, abi: nftAbi, functionName: "creator", args: [1n] });
const cid = uri.replace("ipfs://", "");
console.log("on-chain tokenURI #1:", uri);
console.log("on-chain creator  #1:", creator);
const gateways = {
  "gateway.pinata.cloud": `https://gateway.pinata.cloud/ipfs/${cid}`,
  "cloudflare-ipfs.com": `https://cloudflare-ipfs.com/ipfs/${cid}`,
  "ipfs.io": `https://ipfs.io/ipfs/${cid}`,
  "dweb.sh": `https://dweb.sh/ipfs/${cid}`,
};
const results = {};
for (const [name, url] of Object.entries(gateways)) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const buf = await r.arrayBuffer();
    results[name] = { status: r.status, bytes: buf.byteLength, ct: r.headers.get("content-type") };
    if (name === "gateway.pinata.cloud" && r.ok) {
      const meta = JSON.parse(new TextDecoder().decode(buf));
      console.log("metadata:", JSON.stringify(meta));
      const imgCid = meta.image.replace("ipfs://", "");
      for (const [gn, gbase] of [["pinata", "https://gateway.pinata.cloud/ipfs/"], ["ipfs.io", "https://ipfs.io/ipfs/"]]) {
        try {
          const ir = await fetch(gbase + imgCid, { signal: AbortSignal.timeout(25000) });
          const ib = await ir.arrayBuffer();
          const head = new Uint8Array(ib.slice(0, 4));
          const sig = [...head].map(b => b.toString(16).padStart(2, "0")).join("");
          results["image@" + gn] = { status: ir.status, bytes: ib.byteLength, ct: ir.headers.get("content-type"), magic: sig, isWebP: sig.startsWith("52494646") };
        } catch (e) { results["image@" + gn] = { error: String(e.message).slice(0, 80) }; }
      }
      console.log("image checks:", JSON.stringify(results, null, 1).slice(0, 900));
    }
  } catch (e) { results[name] = { error: String(e.message).slice(0, 80) }; }
}
console.log("\n=== gateway matrix ===");
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(24), JSON.stringify(v));
