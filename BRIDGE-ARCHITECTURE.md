# Cross-Chain NFT Bridge — Technical Architecture (RareCognos)

**STATUS: NOT IMPLEMENTED.** This document is the technical architecture for a
REAL cross-chain NFT bridge. No bridge contract, relayer, indexer, or bridge UI
exists in this repository today; nothing here is wired into the app, and no
claim is made that bridging works. Implementation is a separate, future,
audited project (§8). No placeholder bridge code was added in this package.

## 1. Context and goal

- RareCognos (ERC721Enumerable with `creator`/`tokenForURI` uniqueness) and
  RareCognosMarket deploy **per chain, independently**. LiteForge testnet is
  chain 4441 — LitVM, a Caldera-hosted Arbitrum **Nitro** rollup (`nitro/v3.11.4`
  client observed over RPC on 2026-11-11), native currency zkLTC.
- A bridge would let an owner move a token between LiteForge and another chain
  (Ethereum L1/L2, or another Litecoin-ecosystem rollup) without breaking
  provenance.

## 2. Trust models (ranked for this app)

| Option | Mechanism | Trust base | Verdict for RareCognos |
| --- | --- | --- | --- |
| **Canonical Nitro bridge** (rollup-native) | Use the rollup's built-in L1↔L2 messaging: escrow on one side, release/mint on the other | Sequencer + L1 data availability; typically admin-gated by the rollup operator (Caldera) | Preferred **if** Caldera exposes generic contract messaging for LiteForge — zero extra validator trust. Requires their tooling/availability (unconfirmed; blocker B2/B3 territory) |
| **Third-party messaging** (LayerZero ONFT/V2, Wormhole NTT, CCIP, Axelar) | Source locks/burns; the messaging layer delivers a signed proof; target mints/releases | The messaging network's validator/quorum set + its fees | Good fallback. Adds an external dependency, per-chain deployments, and fee flows |
| **Custom escrow + relayer** | Own `NFTBridgeSource`/`NFTBridgeTarget` + relayer service observing events and submitting on target | Our operator set — weakest unless federated (M-of-N) | Acceptable for a **testnet pilot**; needs §6 mitigations for anything beyond |

## 3. Required components (contract inventory)

1. **`NFTBridgeSource`** (one per source chain)
   - `escrow(tokenId, destChainId)` — lock-and-mint model: takes custody via
     prior approval, records `{destChainId, recipient, nonce}`, emits
     `BridgedOut(nonce, tokenId, destChainId, recipient, uriHash)`.
   - Escrow holds the **original**; withdrawal only through a valid inbound
     message or a timelocked admin `rescue`.
   - Pause switch, per-message relay fee (`msg.value`), nonce registry
     (replay protection). Note: `transferVersion` is **not** portable (risk R7).
2. **`NFTBridgeTarget`** (one per target chain)
   - `release(nonce, proof)` — unlock the escrowed original on its home chain,
     or `mint(...)` — wrapped copy on foreign chains.
   - Verifies: exact source-bridge address + source chain id + authentic
     message (per chosen option) + **unseen nonce**.
3. **`WrappedRareCognos`** (target chains only)
   - ERC721 carrying `originChainId`, `originTokenId`; `tokenURI` mirrors the
     origin IPFS URI (URIs are portable — IPFS content addressing).
   - Blocks wrapped tokens from re-entering as "originals" elsewhere.
4. **Registry/config**: per-chain source/target addresses, supported
   destinations, fee table — immutable constants + upgradeable admin map;
   **never** user input.
5. **Relayer/indexer** (off-chain service, not a contract)
   - Subscribes to source-chain logs (RPC websocket; explorer API when
     healthy — currently 500s from the audit environment).
   - Enforces the finality policy (§R4), quotes/collects fees, signs/submits
     target transactions idempotently, retries, monitors, alerts, publishes a
     public status endpoint.
   - Operator set M-of-N (testnet pilot: M=1 with rate caps; mainnet: M≥2
     diverse operators), key rotation, HSM-backed keys.

## 4. Message flow (lock-and-mint, LiteForge → elsewhere)

1. Owner approves `NFTBridgeSource`, calls `escrow(tokenId, destChainId)` +
   fee. Contract holds the token; `BridgedOut` is emitted.
2. Relayer observes the event, waits out the finality policy, and submits
   `NFTBridgeTarget.mint(nonce, recipient, originTokenId, uri)` (+ proof,
   depending on option).
3. Target verifies origin identity, message authenticity, and unseen nonce →
   mints the wrapped token.
4. **Return path**: owner burns the wrapped token (`NFTBridgeTarget.burn`) →
   relayer → `NFTBridgeSource.release(nonce)` → escrow sends the **original**
   to the recipient.

## 5. Trust assumptions register

| # | Assumption | Holder | Breakage mode |
| --- | --- | --- | --- |
| A1 | Relayer set is honest and live | M-of-N operators | Bridge stalls (funds stay safe in escrow); theft only if quorum colludes **and** target checks are broken |
| A2 | Contract upgrade keys are controlled | Deployer multisig + timelock | Upgrade = total custody of every escrowed original |
| A3 | Finality of source events | Rollup sequencer / messaging validators | Reorg on target → double-mint unless nonce registry + finality policy hold |
| A4 | Fee accounting is contract-enforced | — | Griefing: relay spam drained from treasury |

## 6. Security risks and required mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Replay / double-release | Monotonic consumed nonces on both sides; per-(chain,nonce) completed map |
| R2 | Relayer key compromise | M-of-N threshold, HSMs, rotation, rate limits + daily caps |
| R3 | Upgrade-key theft | Multisig + timelock; no EOA owners; published addresses |
| R4 | Target reorg (Nitro testnet has fast blocks; finality differs from L1) | Relayer waits N confirmations (or L1 finalization where the option provides roots); target accepts only finalized messages |
| R5 | Escrow drain via contract bug | Audits; invariant tests (escrow balance == unclaimed count); pause + timelocked rescue |
| R6 | Provenance split-brain: `tokenForURI`/`creator` are per-chain; wrapped copies create a second "original" | Bridge **originals only** via lock-and-mint; wrapped tokens carry origin ids; UI labels wrapped tokens distinctly; never burn-and-mint originals on foreign chains |
| R7 | `transferVersion`/listing nonces are single-chain (market listings bind to one collection address) | Markets stay single-chain by design; bridged tokens cannot satisfy listings on another chain — document, don't "fix" |
| R8 | URI uniqueness across chains | IPFS CIDs are content-identical on both chains; `tokenForURI` dedupe does **not** span chains — documented, accepted |
| R9 | Fee draining / censorship | Contract-set per-message fee; relayer subsidies transparent; status endpoint |
| R10 | User sends to wrong destination | UI: explicit chain + destination confirmation; contract: `destChainId` validated against the registry |

## 7. What would change in the app when built (and what must not)

- New contracts live in `contracts/` with their own compile/test/deploy
  scripts and config namespace — `config/liteforge.json` stays
  deployment-only.
- A bridge UI surface appears **only after Phase 1 acceptance evidence** (§8);
  it would be its own gated screen, never part of the unconfigured-state
  marketplace.
- The existing `configured` gate in `src/lib/nft/config.ts` is untouched by
  bridging.

## 8. Rollout phases (each gate blocks the next)

- **Phase 0** — full spec + threat model from this architecture; invariant
  tests; zero UI. Exit: spec reviewed, tests green, no key material anywhere.
- **Phase 1** — testnet pilot: single relayer with rate caps,
  `WrappedRareCognos` on a second testnet; acceptance script proves
  lock → mint → burn → release round trip end-to-end. Exit: script passes on
  both chains, pause/rescue drills executed.
- **Phase 2** — multi-operator relayer set, external audit, caps raised.
- **Phase 3** — mainnet consideration with monitored rollout and emergency
  pause runbook.

## 9. Explicit non-goals of the current package

- No bridge contracts in this repo (nothing scaffolded "for later" in
  `contracts/`).
- No relayer code, no bridge UI, no bridge env vars, no bridge config keys.
- `config/liteforge.json` remains the deployment/verification record only.
