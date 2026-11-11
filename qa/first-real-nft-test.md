# RareCognos — First Real NFT Sale: Final QA Report

**Verdict: YES. RareCognos completed its first real NFT sale.**
Token `RareCognos #1` ("01 wawe") sold for **0.01 zkLTC** on LiteForge Zeeve 4441. Ownership moved to a
third-party buyer, the seller received **exactly 0.009975 zkLTC**, and the treasury received
**exactly 0.000025 zkLTC** — the contract's 0.25% fee, its first ever nonzero fee.
All verification was **read-only**: no signing, no sending, no redeploy, no repeat purchase, no
unrelated code changes.

- Transaction: `0xfa68d8c01640a99d4f0512d238c4094d75b9ad87a15152af375f3ad35c6846d8`
- Block 70062538 · `status: success` · gas 156,863 (1,568,630,000,000 wei ≈ 0.00000157 zkLTC)
- Decoded calldata: `buy(3, 10000000000000000)` on market `0x77c0ea4283ea569fB40FC86641799693381B7Ec0`
- Events: `Purchased`, `SaleSettled`, `Transfer`
- Machine-readable results: `qa/first-real-nft-purchase-verification.json` (25/26 checks; the one
  non-pass is an informational identity finding, below) · `qa/first-real-nft-test.json`
- Reproduce: `node qa/verify-purchase.mjs <txhash>` · `node qa/post-sale-ui-check.mjs`

## PASS/FAIL

| # | Metric | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Transaction succeeded | **PASS** | `receipt.status = success`; explorer `result=success`, `method=buy`, `value=10000000000000000` |
| 2 | `buy()` + events decoded | **PASS** | `buy(listingId=3, expectedPrice=1e16)`; `SaleSettled{seller,treasury,price 1e16, fee 2.5e13, proceeds 9.975e15}` |
| 3 | **Ownership** | **PASS** | `ownerOf(#1) = 0xAc2b060448ce420b18d951c663f24E8A286035A4` = `Purchased.buyer` = tx sender; `Transfer` seller→buyer; `creator(#1)` still the seller (immutable by design); `getApproved(#1)` reset to `0x0` on transfer |
| 4 | Listing #3 no longer active | **PASS** | `listings(3).active = false`, `activeListing(#1) = 0`; #1 and #2 remain inactive |
| 5 | Sale price 0.01 zkLTC | **PASS** | `tx.value` = calldata `expectedPrice` = `SaleSettled.price` = 10,000,000,000,000,000 wei |
| 6a | **Seller proceeds** | **PASS** | live 85,871,075,241,376,077 − pre-purchase snapshot 75,896,075,241,376,077 = **exactly 9,975,000,000,000,000 wei (0.009975)**; seller nonce 26→26, so no other value passed through the account |
| 6b | **Marketplace fee** | **PASS** | treasury live balance = **exactly 25,000,000,000,000 wei (0.000025)** vs snapshot 0 wei. The treasury's only possible income is `floor(price×25/10000)`, so this balance *is* the fee. `fee + proceeds = price` |
| 8 | Public UI reflects the sale | **PASS** | 4/4 (`qa/post-sale-ui-verdict.json`) |

**25/26 checks passed.** The single non-pass is `sender-matches-prepared-wallet-B` — see below.

## The actual buyer

The payer was **`0xAc2b060448ce420b18d951c663f24E8A286035A4`** (EOA, nonce 24, 0.0125215831693413 zkLTC left).

This is **not** the wallet I had prepared for the purchase. The prepared second wallet
`0xfeb935dc86d5549e2a61003dd5f2d52f6f840811` still holds **exactly 0.02 zkLTC at nonce 0** — it never sent
a transaction, so it did not buy. The sale is nonetheless a valid third-party purchase: the sender is
neither the seller nor the treasury, and the market's own `seller != buyer` rule was satisfied.
If the intent was specifically for that prepared account to buy, that did not happen.

## Verification method (and a network constraint)

Archive `block`/`block-1` balance deltas were **unavailable** for this run — the purchase was already 906
blocks behind head, and the public Zeeve RPC prunes *state* after ~100 blocks (~90 s at 0.88 s/block);
`eth_getLogs` times out even for a single block. Receipts, transactions and block headers do survive.

Settlement therefore rests on three mutually consistent read-only sources:

1. **Receipt events** — `SaleSettled` supplies the authoritative price, fee and proceeds.
2. **Live balances vs the saved pre-purchase snapshot** (block 70060374) — both deltas match to the wei.
3. **Conservation + contract structure** — the treasury can only ever receive the 0.25% fee, so its
   0 → 25000000000000 movement cannot be anything else; `fee + proceeds = price`.

`qa/verify-purchase.mjs` still attempts the archive reads first and will use them when run inside the
window (it did report them for the delta path when in range).

## Public UI post-sale state — 4/4 PASS

| Case | Result |
| --- | --- |
| Guest Explore | 0 buy buttons; "no active sales" shown — the marketplace is genuinely empty after the sale |
| Buyer on `#token/1` | wallet chip connected; **no** buy control offered (the app correctly blocks self-buy) |
| Buyer My NFTs | ownership card `1/1 · #1`, name **"01 wawe" resolved from IPFS** (gateway 200), state "Not currently for sale" |
| Seller My NFTs | no ownership card for token #1 — the seller's view correctly lost the work |

### Resolved: this was never an application bug

An earlier version of this check reported `buyer-my-nfts` as FAIL. Three causes, all in my harness:

1. **Brittle selector / no explicit connect.** The header renders a plain "Connect wallet" button with one
   connector and a **menu** with several. My batched run assumed auto-connect, so the page legitimately
   rendered the signed-out state ("Connect your wallet in the top bar") with **zero gateway requests** —
   the tell that it never reached the metadata stage. The app was correct.
2. **Fixed sleep racing an async read.** The artwork name is fetched per token from a public IPFS
   gateway. Instrumented diagnosis (`qa/buyer-mynfts-diagnosis.json`) showed the ownership card at 2 s and
   the IPFS name at **8 s**, gateway answered `200`. The app renders "Loading artwork…" then a `Token #1`
   fallback and a "Metadata could not be loaded" + Retry control if the gateway fails — correct behaviour.
3. **Gateway-dependent assertion.** Asserting the literal name "01 wawe" conflated on-chain ownership
   with off-chain gateway health. The check now asserts the ownership card and reports name vs fallback.

Both checks now poll for the expected state and classify the cause from evidence (connection chip,
gateway status codes, the app's own error states) instead of failing blind.

## Remaining UI issue (not transaction-blocking)

**Hydration mismatch when a wallet already exposes accounts at first paint.** With a mock provider that
returns an account immediately, the console reports:
`PAGEERROR Hydration failed because the server rendered HTML didn't match the client… <Menu __scope…`
React then regenerates the tree client-side, so functionality recovers and nothing is blocked — but it is
a real console error in the deployed SSR app whenever a returning visitor's extension is already
connected. Source is `wagmi` `ssr: true` plus the persisted-account branch inside the Radix wallet menu in
`src/components/market-header.tsx`. It does **not** appear when the provider follows normal
"expose nothing before connect" semantics, which is why the corrected harness shows `errors=0`.
Left untouched per "keep existing design unchanged / do not refactor unrelated code". Suggested fix when
wanted: gate the wallet chip/menu behind a mounted flag.

## Other notes

- Contracts unchanged: collection `0x289A621429dBB1Bd47288697821aC54e22C0035D`, market
  `0x77c0ea4283ea569fB40FC86641799693381B7Ec0`, both source-verified, `FEE_BPS = 25`, `market.owner()` =
  seller A. No redeploy. No new contracts. No keys or seed phrases handled.
- Environment repairs were confined to `node_modules` (`better-sqlite3` Windows prebuild) and new files
  under `qa/`. `src/`, `contracts/`, `config/` and `upload-service/` are byte-for-byte untouched.
- NFT bridge not implemented, as instructed.
- `qa/watch-purchase.mjs` was corrected after the fact: it originally resolved the sale from the
  **prepared buyer's** address, which is why it logged "no market tx for the buyer is indexed yet" while
  the treasury had already moved. It now resolves the `buy()` from the **market contract's** indexed
  transactions, so it works whichever account pays. It was not re-run afterwards, to avoid rewriting the
  verified record.
- The public app is still running on `http://localhost:8080`; the upload service on `:8787`
  (`node qa/upload-service.start.mjs` — see blockers section for why not `npm run upload:serve`).

## Files

`qa/first-real-nft-purchase-verification.json` · `qa/first-real-nft-test.json` · this report ·
`qa/verify-purchase.mjs` · `qa/post-sale-ui-check.mjs` + `post-sale-ui-verdict.json` + screenshots ·
`qa/buyer-mynfts-diagnose.mjs` + `buyer-mynfts-diagnosis.json` · `qa/nft-chain-audit.txt` ·
`qa/nft-flow-simulation.json` · `qa/public-app-verdict.json` · `qa/seller-flow-check.mjs` ·
`qa/buyer-flow-check.mjs` · `qa/upload-service-verdict.json` · `qa/ipfs-flow-check.mjs` ·
`qa/rpc-capability-final.mjs` · `qa/upload-service.start.mjs`
