// READ-ONLY state verifier for the two-wallet testnet acceptance plan (qa/testnet-acceptance.plan.md).
// Signs nothing, spends nothing: public RPC reads only. No private key is read or accepted.
// ABIs come from the local artifacts — identical to the deployed code once explorer-verified.
//
// Usage:
//   npm run testnet:acceptance                                        # dump state (config/liteforge.json)
//   npm run testnet:acceptance -- --collection 0x.. --market 0x..     # explicit addresses
//   ... -- --token 2 --expect-owner 0xA --expect-creator 0xA ...      # assert expected states
//
// Expectation flags (all optional, combinable):
//   --expect-owner 0x..            ownerOf(token) == address
//   --expect-creator 0x..          creator(token) == address
//   --expect-next-id N             nextId() == N
//   --expect-approved-market       market approved for the current token owner
//   --expect-not-approved          market NOT approved for the current token owner
//   --expect-listing-active        an active listing exists for the token
//   --expect-price 0.01            active listing price (zkLTC)
//   --expect-seller 0x..           active listing seller
//   --expect-no-listing            no active listing for the token
//   --expect-inactive-listing N    listings(N).active == false (cancelled / bought / superseded)
import fs from "node:fs";
import { createPublicClient, http, formatEther, isAddress, parseEther } from "viem";

const RPC = "https://rpc.testnet.liteforge.zeeve.net";
const CHAIN_ID = 4441;
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};

const dep = JSON.parse(fs.readFileSync("config/liteforge.json", "utf8"));
const collection = arg("--collection", dep.collection);
const market = arg("--market", dep.market);
if (!collection || !market || !isAddress(collection) || !isAddress(market)) {
  console.error(
    "No deployed addresses known. Pass --collection 0x.. --market 0x.. (or record them in config/liteforge.json).",
  );
  process.exit(1);
}
const token = BigInt(arg("--token", "1"));

const client = createPublicClient({ transport: http(RPC, { timeout: 30000 }) });
const chainId = parseInt(await client.request({ method: "eth_chainId" }), 16);
if (chainId !== CHAIN_ID) {
  console.error(`RPC chain ${chainId} != ${CHAIN_ID}`);
  process.exit(1);
}

const nftArtifact = JSON.parse(fs.readFileSync("artifacts/RareCognos.json", "utf8"));
const marketArtifact = JSON.parse(fs.readFileSync("artifacts/RareCognosMarket.json", "utf8"));
const read = (address, abi, functionName, args = []) =>
  client.readContract({ address, abi, functionName, args });
const safe = async (fn) => {
  try {
    return await fn();
  } catch {
    return undefined;
  }
};
const sameAddr = (a, b) =>
  typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS " : "FAIL "}${label} — ${detail}`);
  if (!ok) failures.push(label);
};

console.log(
  `LiteForge ${CHAIN_ID} state dump — collection ${collection}, market ${market}, token ${token}`,
);

// Market ↔ collection binding is always checked.
const marketCollection = await safe(() => read(market, marketArtifact.abi, "collection"));
check(
  "market.collection() binding",
  sameAddr(marketCollection, collection),
  `market.collection()=${marketCollection}`,
);

const [name, symbol, version, nextId] = await Promise.all([
  safe(() => read(collection, nftArtifact.abi, "name")),
  safe(() => read(collection, nftArtifact.abi, "symbol")),
  safe(() => read(collection, nftArtifact.abi, "version")),
  safe(() => read(collection, nftArtifact.abi, "nextId")),
]);
console.log(`collection: name=${name} symbol=${symbol} version=${version} nextId=${nextId}`);

const owner = await safe(() => read(collection, nftArtifact.abi, "ownerOf", [token]));
const creator = await safe(() => read(collection, nftArtifact.abi, "creator", [token]));
const uri = await safe(() => read(collection, nftArtifact.abi, "tokenURI", [token]));
const transferVersion = await safe(() =>
  read(collection, nftArtifact.abi, "transferVersion", [token]),
);
console.log(`token ${token}: owner=${owner} creator=${creator} transferVersion=${transferVersion}`);
console.log(`token ${token}: uri=${uri}`);

const count = await safe(() => read(market, marketArtifact.abi, "count"));
console.log(`market: count=${count}`);
const activeListingId = await safe(() =>
  read(market, marketArtifact.abi, "activeListing", [token]),
);
const listing =
  activeListingId && activeListingId > 0n
    ? await safe(() => read(market, marketArtifact.abi, "listings", [activeListingId]))
    : null;
if (listing) {
  const [seller, listingToken, price, active, nonce] = listing;
  console.log(
    `listing ${activeListingId}: seller=${seller} token=${listingToken} price=${formatEther(price)} zkLTC active=${active} nonce=${nonce}`,
  );
} else {
  console.log(`token ${token}: no active listing (activeListing=${activeListingId})`);
}

// ---- expectations ----
const has = (n) => argv.includes(n);
const eth = (v) => {
  try {
    return parseEther(v);
  } catch {
    console.error(`--expect-price ${v} is not a valid amount`);
    process.exit(1);
  }
};

if (argv.some((a) => a.startsWith("--expect"))) {
  if (has("--expect-owner"))
    check("expect-owner", sameAddr(owner, arg("--expect-owner")), `ownerOf(${token})=${owner}`);
  if (has("--expect-creator"))
    check(
      "expect-creator",
      sameAddr(creator, arg("--expect-creator")),
      `creator(${token})=${creator}`,
    );
  if (has("--expect-next-id"))
    check("expect-next-id", nextId === BigInt(arg("--expect-next-id")), `nextId=${nextId}`);
  if (has("--expect-approved-market") || has("--expect-not-approved")) {
    const approved = owner
      ? await safe(() => read(market, marketArtifact.abi, "approved", [token, owner]))
      : undefined;
    if (has("--expect-approved-market"))
      check(
        "expect-approved-market",
        approved === true,
        `market.approved(${token}, owner)=${approved}`,
      );
    else
      check(
        "expect-not-approved",
        approved === false,
        `market.approved(${token}, owner)=${approved}`,
      );
  }
  if (has("--expect-listing-active"))
    check(
      "expect-listing-active",
      !!listing && listing[3] === true && listing[1] === token,
      listing ? `listing ${activeListingId} active=${listing[3]}` : "no active listing",
    );
  if (has("--expect-price")) {
    const expected = eth(arg("--expect-price"));
    check(
      "expect-price",
      !!listing && listing[2] === expected,
      listing ? `price=${formatEther(listing[2])} zkLTC` : "no active listing",
    );
  }
  if (has("--expect-seller"))
    check(
      "expect-seller",
      !!listing && sameAddr(listing[0], arg("--expect-seller")),
      listing ? `seller=${listing[0]}` : "no active listing",
    );
  if (has("--expect-no-listing"))
    check(
      "expect-no-listing",
      !activeListingId || activeListingId === 0n || listing?.[3] === false,
      `activeListing(${token})=${activeListingId}`,
    );
  const inactive =
    argv.indexOf("--expect-inactive-listing") >= 0 ? arg("--expect-inactive-listing") : undefined;
  if (inactive !== undefined) {
    const l = await safe(() => read(market, marketArtifact.abi, "listings", [BigInt(inactive)]));
    check(
      `expect-inactive-listing ${inactive}`,
      !!l && l[3] === false,
      `listings(${inactive}).active=${l ? l[3] : "undefined"}`,
    );
  }
  console.log(
    failures.length
      ? `\nRESULT: ${failures.length} EXPECTATION(S) FAILED`
      : "\nRESULT: ALL EXPECTATIONS PASSED",
  );
  process.exit(failures.length ? 1 : 0);
} else {
  console.log("\nstate dump only — pass --expect-* flags to assert expected states (see header).");
}
