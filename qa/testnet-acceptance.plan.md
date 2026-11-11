# LiteForge testnet — two-wallet NFT acceptance plan

Status: **PLAN — not executed.** Requires a funded deployer key (owner action),
deployed and explorer-verified contracts, and `verified: true` in
`config/liteforge.json` first. Tooling: `npm run nft:preflight` (gate 1),
`npm run nft:deploy -- --write-config` (gate 2, owner-only),
`npm run nft:verify-prep` (§ `REMEDIATION_PLAN.md` §6 manual steps 1–5).

## Wallets, network, funding

- **Wallet A = creator/seller**, **Wallet B = buyer**. Two separate browser
  profiles (or hardware/injected wallets) so approvals and signatures never
  cross.
- Both wallets add the network (not in default lists yet — add manually):
  - RPC: `https://rpc.testnet.liteforge.zeeve.net`
  - Chain id: `4441` · currency: `zkLTC` (18 decimals) · testnet
  - Explorer: `https://explorer.testnet.liteforge.zeeve.net`
- Funding: both wallets need zkLTC. Gas is trivial (observed 0.01 gwei base
  fee, 0 priority fee), but plan amounts so a purchase can be paid exactly:
  fund **each wallet with ≥ 0.1 zkLTC** for a 0.01 zkLTC test price + gas.
  Faucet: LiteForge/Zeeve testnet faucet — confirm the current location
  (blocker B4 in `REMEDIATION_PLAN.md` §6).
- Record addresses before starting: `A=0x…`, `B=0x…`.
- Wallets must match the connected chain at every step — the app's
  `transact()` already refuses wrong-network sends ("Wrong network"), which is
  itself a checkpoint (step 8).

## Command used for assertions

```text
npm run testnet:acceptance -- --token <N> [--expect-owner 0xA] [--expect-creator 0xA]
  [--expect-next-id N] [--expect-approved-market | --expect-not-approved]
  [--expect-listing-active [--expect-price 0.01] [--expect-seller 0xA]]
  [--expect-no-listing] [--expect-inactive-listing <listingId>]
```

Full flag list: header of `qa/testnet-acceptance.mjs`. The verifier is
read-only: it signs nothing and has no key path. Every step also has an
explorer check (tx status + event) — URLs use
`https://explorer.testnet.liteforge.zeeve.net/tx/<hash>`.

## Steps

### 0. Gate: preflight + deploy + verification (owner)

1. `DEPLOYER_ADDRESS=<public address> TREASURY_ADDRESS=<public treasury address> npm run nft:wallet-readiness` → read-only simulations, gas estimates, balance and network checks. No key or signature is used. Estimates and the predicted collection address can change with nonce, fees and network state. The treasury must be explicitly chosen and controlled by the project; no address is assumed.
   For the local browser workflow, run `npm run nft:deploy:local` and open `http://127.0.0.1:8080`. Connect OKX Wallet, select chain 4441 and simulate the collection. A user must separately approve the collection deployment, then enter and independently verify the treasury address before simulating and separately approving the market deployment. Never enter a private key. The page is not available in production builds. Only proceed after independent contract review and explicit deployment authorization.
2. Before any eventual deployment, independently confirm the Zeeve/Caldera fork, current fees and balance. This readiness check does not send transactions or verify a live deployment.
3. `npm run nft:deploy -- --write-config` → collection + market addresses recorded.
4. `npm run nft:verify-prep -- --collection 0x… --treasury 0x…` → verify both contracts
   (paths in `artifacts/verification/README.md`); compare runtime bytecode with
   the fingerprints in `artifacts/verification/verification-meta.json`.
5. Set `verified: true` + `verificationUrls` in `config/liteforge.json`.
6. `npm run testnet:acceptance` (dump mode) → `market.collection() binding` PASS.

### 1. Mint (wallet A)

- Action: app Create page (upload image → signed upload → mint) or any mint UI
  path; URI must be `ipfs://` (contract enforces >14 and ≤200 chars).
- Assert:
  `--token 1 --expect-owner 0xA --expect-creator 0xA --expect-next-id 1`
- Explorer: `ArtworkMinted(1, A, ipfs://…)` + `Transfer(0x0, A, 1)`.
- Expected reverts (try once, observe UI error): non-ipfs URI → "IPFS URI
  required"; duplicate URI → "Edition already minted".

### 2. Approve marketplace (wallet A)

- Action: initiate a list on the token — the app grants `approve(market, tokenId)`
  as part of the list flow (two txs).
- Assert: `--token 1 --expect-approved-market`
- Explorer: `Approval(A, <market>, 1)`.

### 3. List (wallet A) at 0.01 zkLTC

- Action: list token 1 at `0.01`.
- Assert: `--token 1 --expect-listing-active --expect-price 0.01 --expect-seller 0xA`
- On-chain: `listings(1) = (A, 1, 0.01e18, true, transferVersion)`; `activeListing(1) = 1`;
  `market.count() = 1`. Explorer: `Listed(id, A, 1, 0.01e18)`.
- Expected revert: listing with zero price → "Zero price".

### 4. Buy (wallet B)

- Action: wallet B opens the listing in the app and buys (exact value enforced
  by the UI and the contract: `expectedPrice` + `msg.value`).
- Assert: `--token 1 --expect-owner 0xB --expect-creator 0xA --expect-no-listing --expect-inactive-listing 1`
- Balances: A receives exactly 0.01 zkLTC (plus gas refund mechanics), B pays
  0.01 + gas. Explorer: `Purchased(id, B)` + `Transfer(A, B, 1)`.
- Expected reverts: buy with `value = price − 1` → "Price changed"; buy with
  wrong `expectedPrice` → "Price changed"; A buying own listing →
  "Unavailable"; repeat buy → "Unavailable".

### 5. Cancel flow (wallet A mints token 2, lists, cancels)

- Action: A mints token 2, lists it, then cancels from the app.
- Assert: `--token 2 --expect-owner 0xA --expect-no-listing --expect-inactive-listing 2`
- Expected reverts: B's buy after cancel → "Unavailable"; B calling `cancel(2)`
  → "Not active seller".

### 6. Reprice flow (wallet A re-lists token 3 at a new price)

- Repricing is **re-listing**: `list()` auto-deactivates the token's previous
  active listing (verified by local scenario 6). There is no separate reprice
  function.
- Action: A mints token 3, lists at `0.02`, then lists again at `0.03`.
- Assert: `--token 3 --expect-listing-active --expect-price 0.03 --expect-seller 0xA`
  plus `--expect-inactive-listing <firstListingId>` (dump mode reveals ids).
- Expected reverts: buying the superseded listing → "Unavailable"; A buying
  the new own listing → "Unavailable".

### 7. Ownership / provenance checks

- Creator persists after sale: token 1 asserts `--expect-creator 0xA` while
  owned by B (already covered in step 4's command — keep it there).
- `transferVersion` increments on every transfer (mint counts as one). After
  step 4: `transferVersion(1) = 2` (dump mode prints it).
- Stale-listing rejection after ownership churn: transfer token 3 to B and
  back (or list after a transfer round-trip without re-approving) → buy →
  "Stale listing" (nonce mismatch). Local contract tests cover this (scenarios
  3/6); repeat once on testnet after A transfers the token to B and back.

### 8. Wrong-network guard

- With a wallet connected to a different chain, attempt any transaction in the
  app → refused with "Wrong network" before any simulation or send
  (`src/lib/nft/transaction.ts`, `assertChain`). One manual confirmation is
  enough; unit-tested locally (scenario 4).

## Negative/revert checklist (consolidated)

| Case | Expected revert |
| --- | --- |
| `list` before approval | "Approval required" |
| `list` by non-owner | "Not owner" |
| `buy` with wrong value/expectedPrice | "Price changed" |
| `buy` own listing | "Unavailable" |
| `buy` after cancel | "Unavailable" |
| `buy` after approval revoked (`approve(0x0, token)`) | "Stale listing" |
| `buy` after ownership round-trip | "Stale listing" |
| `cancel` by non-seller | "Not active seller" |
| `mint` duplicate URI | "Edition already minted" |
| `mint` non-ipfs/short/long URI | "IPFS URI required" / "Invalid URI" |

## Success criteria

- All `testnet:acceptance` assertion runs exit 0; every revert case shows the
  app's error surface with the contract message.
- Explorer shows all txs from both wallets; verified badges on both contracts.
- The app (built with the default auth-OFF config) renders the configured
  marketplace on chain 4441: collection + market visible, buy flow completes
  end-to-end with wallet B.
