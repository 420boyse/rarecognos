# RareCognos V2 — Production-Readiness Plan (v2)

Tarih: 11 Kasım 2026. Bu belge bir **denetim/plandır** — deployment, gerçek
zincir işlemi, imza veya kod push yapılmadı. (Bu sürümden itibaren İngilizce;
okunabilirlik için.)

## 1. Dependency decisions of this pass (evidence-backed)

`npm audit --json` (fresh, post-upgrade): **71 findings** — 6 critical, 40 high,
21 moderate, 4 low (was 73: 6c/42h/21m/4l). Direct vulnerable modules now: 6.

### Applied (non-breaking, verified)

| Package | From → To | Why safe |
| --- | --- | --- |
| `viem` | 2.38.5 → **2.57.17** | pins `abitype@1.2.3` + `ws@8.21.0`; wagmi 2.19.5 peer allows `viem 2.x` (checked registry). Clears viem/abitype highs without the wagmi major. |
| `zod` | ^4.4.0 → **^4.6.6** | clears root `zod` high (GHSA-mrhx-c7xc-m3w5 fixed in 4.6.6). |
| `@x402/evm` | 2.0.0 → **^2.30.0** | pins `zod ^4.6.6`, `viem ^2.48.11`. Not imported anywhere in `src/` (grep: 0 matches) — removal candidate later. |
| `solc` | 0.8.30 → **^0.8.36** | **No safe 0.8.x exists**: advisory A covers `0.5.1–0.8.36` (low, old `tmp`), advisory B covers `>=0.8.37` (high, new `tmp`). 0.8.36 minimizes severity. Dev-only (`scripts/nft-compile.mjs`); production exposure: none. |
| `better-auth` | ~1.6.30 → **~1.6.34** | latest patch **within the deliberately pinned 1.6 line** (original manifest chose `~` for this reason). Zero code changes; all tests green. |

Verification battery after upgrades (all green):
`npm run typecheck` 0 errors · `npm test` 260/260 (201 script + 59 lib) ·
`test:upload` 1/1 · `test:transaction` 2/2 · `nft:test` 8/8 (solc 0.8.36 +
Ganache) · `npm run build` OK · `qa/built-smoke.mjs` ok:true (1440px + 390px,
zero console errors, no horizontal overflow).

### Deferred (breaking majors — NOT applied, per instructions)

| Package | Installed | Fix | Reason |
| --- | --- | --- | --- |
| `wagmi` | 2.19.5 | 3.7.11 (MAJOR) | `wagmi/connectors` tree carries the @reown/@walletconnect/@metamask moderates + `uuid`/`query-string` highs. Requires connector API migration + full `nft:*` re-test. |
| `sharp` | 0.34.3 | 0.35.5 (MAJOR) | upload-service only; native module → Docker image rebuild needed. |
| `ganache` | 7.9.2 | npm suggests **6.4.5 = downgrade — rejected**. Local test RPC only (`127.0.0.1:8545`); keys are throwaway. |
| `typescript-eslint` | ≤8.72.2 | 8.36.0 is a **downgrade** (dev-only lint) — rejected. |

Remaining transitive highs live in dev toolchains (mocha/webpack/@microsoft/*
family) and the `@wagmi/connectors` tree — all clear with the two deferred
majors.

### better-auth: why 1.7.20 was reverted (decision record)

1.7.20 was applied, then `npm run typecheck` failed:

- `src/lib/auth/client.ts(1,10)` — `genericOAuthClient` no longer exported from
  `better-auth/client/plugins`.
- `src/lib/auth/popup.server.ts(65,35)` — `auth.api.signInWithOAuth2` removed.

Probe of 1.7.7 / 1.7.14 / 1.7.19 tarballs: **the API was removed in 1.7.0
itself** — there is no 1.7.x that is both security-patched (fixes land `<1.7.7`
ranges) and API-compatible. Upgrading is a breaking migration, out of scope for
"safe, non-breaking upgrades only". Reverted to ~1.6.34.

**1.7.20 migration map** (for the follow-up):

- Client plugin: `genericOAuthClient()` → `oauthPopupClient()` — adds
  `authClient.signIn.popup({ providerId, callbackURL, … })`
  (`SignInPopupOptions`/`SignInPopupResult`), pairs with server `oauthPopup`
  plugin and `bearer`. Token lands in **localStorage** (`POPUP_TOKEN_STORAGE_KEY`)
  via `popupBearerFetchPlugin` (attaches bearer when embedded, clears on
  sign-out endpoints) — replaces our hand-rolled sessionStorage
  `grok-auth.bearer-token` + `onRequest` hook in `client.ts`.
- Server: `genericOAuth` is now **zero-endpoint** ("Providers are used through
  the standard `signIn.social` and `callback/:id` core endpoints"); new
  `oauthPopup()` server plugin registers `GET /oauth-popup/start` and swaps the
  OAuth callback redirect for a completion page that posts the session token to
  the opener (`OAUTH_POPUP_COMPLETE_SCRIPT`, CSP hash
  `sha256-tIo2K8VBC9SnhvdZ+9GsGkQoZm+jm/JcxL+d+i8b8KQ=`).
- Files to rewire: `src/lib/auth/client.ts` (plugin + `signIn()` popup/redirect
  branches), `src/lib/auth/popup.server.ts` (whole custom handler becomes
  redundant — the plugin's completion page replaces it), `vite.config.ts`
  (`authPopupPlugin`), `src/lib/auth/middleware.ts` (token source if switching
  storage). Custom `gate-session.server.ts` hook ordering with the new
  callback-swap must be re-verified.
- **Residual risk on 1.6.34**: `GHSA-965c-763c-88jm` (OAuth state as magic link,
  fixed ≥1.7.x) applies to the auth-ON variant's genericOAuth flow.
  `GHSA-r4xp-prcw-77qf` (OAuth Proxy) applies only if the proxy feature is used
  — not registered in `src/lib/auth/server.ts`. Device-login and
  drizzle/kysely-adapter advisories: not applicable (plugins/adapters unused;
  app uses its own Kysely dialect over PGLite, not `@better-auth/kysely-adapter`).
  In the **shipped auth-OFF build no Better Auth HTTP surface exists at all**
  (no `/api/auth/*` route is mounted — verified: `GET /api/auth/get-session`
  → 404 on the served build).

## 2. Dual-build verification (auth-ON vs auth-OFF)

| Check | auth-ON (`VITE_AUTH_ENABLED=true` via process env) | auth-OFF (shipped default, `.grok/app-env.json`) |
| --- | --- | --- |
| `npm run build` | ✅ passed | ✅ passed (final build matches shipped config) |
| Browser smoke (both viewports) | ✅ ok:true — evidence `qa/auth-on-variant/{built-smoke-verdict.json,desktop,mobile}.png` | ✅ ok:true — `qa/built-smoke-verdict.json` (final state) |
| `buildAuthEnabled()` resolution | true (env override wins in `scripts/with-app-env.mjs#mergeAppEnv`) | false |
| `GET /` | 200, app renders (auth gates not consumed by marketplace UI — by design) | 200 |
| `GET /api/auth/get-session` | 404 — **no `/api/auth/*` routes mounted in this app** | 404 |
| `GET /auth/popup` | 404 (SPA) in the **built** output — the handler is dev-only live-preview middleware (`vite.config.ts` `authPopupPlugin`) | 404 |

Note: this app never renders the template's sign-in gates (`gates.tsx` /
`UserButton` unused by `src/components/*`), and `AGENTS.md` forbids creating
`src/routes/api/auth/$.ts` for auth-off apps. Better Auth is used server-side
only: `verify.server.ts#requireUserId` → `auth.api.getSession`, plus the
dev-only `/auth/popup` popup handler. The fail-closed invariant
(`DATABASE_URL` set + auth off → refuse shared dev user) is unit-tested
(`src/lib/auth/verify.server.ts`, gate-identity tests 59/59 lib suite).

## 3. Production-readiness checklist

| Capability | Status | Evidence |
| --- | --- | --- |
| Wallet connect (injected + WalletConnect when project id present; `getProvider()` pre-check; error surfaced `role="alert"`) | **IMPLEMENTED, TESTED LOCALLY** | `src/components/market-header.tsx`; `nft:test` scenarios 1–8; NOT testnet-verified |
| Wrong-network gating + chain switch (`useSwitchChain.switchChainAsync`, tx closed when `account.chainId !== chain.id`) | **IMPLEMENTED, TESTED LOCALLY** | `market-header.tsx`, `nft-token.tsx` ready-gate, scenario 4 (wrong network) |
| Mint (`RareCognos.mint(uri)`; URI-edition uniqueness via `tokenForURI`; creator recorded) | **IMPLEMENTED, TESTED LOCALLY** | `contracts/RareCognos.sol`, `nft-create.tsx`, scenarios 1, 5, 7; **NOT TESTNET** |
| Approvals (grant on list, per-token revoke `approve(zeroAddress)`, collection-wide revoke `setApprovalForAll(market,false)` with confirm step) | **IMPLEMENTED, TESTED LOCALLY** | `nft-token.tsx:263–308`; scenario 3 (revoked approval + stale listing) |
| List / reprice / cancel (`market.list`, cancel guarded; replacement only with same `to+input+value`) | **IMPLEMENTED, TESTED LOCALLY** | `nft-token.tsx`, `nft-market.tsx`, `transaction.ts#sameTransaction`; scenarios 2, 6 |
| Buy (CEI + `nonReentrant` `buy()`; exact `expectedPrice + msg.value`; owner/approval/`transferVersion` re-checks client + chain) | **IMPLEMENTED, TESTED LOCALLY** | `contracts/RareCognos.sol#buy`, `nft-token.tsx` re-checks; scenarios 1, 3, 6, 7, 8; **NOT TESTNET** |
| Transaction error handling (pre-send simulation, wallet rejection, reverted receipt ≠ success, insufficient balance, account switch mid-flight, 180 s receipt follow-up with nonce re-scan, no resend) | **IMPLEMENTED, TESTED LOCALLY** | `src/lib/nft/transaction.ts`, scenarios 4, 8; NOT testnet-verified |
| Upload service (signed user-image upload → IPFS) | **IMPLEMENTED LOCALLY; production hosting NOT DONE** | `upload-service/server.mjs` + Dockerfile shipped; `test:upload` 1/1; handoff §Kalıcı upload servisini kurma: needs separate HTTPS host + persistent disk; Docker build untested in this environment |
| LiteForge testnet contracts | **NOT DEPLOYED** | `config/liteforge.json`: `collection: null`, `market: null`, `verified: false`, no tx hashes, empty `verificationUrls`; `src/lib/nft/config.ts#configured` gate closes ALL chain interactions when unconfigured (verified read); explorer probes from here returned 500s/no content (nothing to verify); handoff §Yayın durumu states two-wallet testnet acceptance never run. Integration package built this pass (§6): preflight/deploy/verify-prep/acceptance tooling ready, nothing executed |
| NFT bridge | **NOT IMPLEMENTED** | No bridge code in `src/` (grep: only `PreviewHostBridge` platform chrome + a comment); no bridge UI reference; no bridge config |
| Auth (Better Auth stack) | **Template chrome only — IMPLEMENTED as library code, NOT mounted in UI** | No `src/routes/api/auth/$.ts`; `gates.tsx` unused by components; `verify.server.ts` fail-closed invariant tested; deployed federated auth (broker) **NOT TESTED** (needs platform GROK_AUTH_* injection) |
| PWA/platform chrome (OG injection, manifest, install tutorial) | **IMPLEMENTED, TESTED LOCALLY** | 201 script tests incl. injector suite; smoke shows `og:title` injected |
| Production build & preview serving | **IMPLEMENTED, TESTED LOCALLY** | `npm run build` + Nitro vercel preset; `qa/built-smoke-verdict.json` ok:true |

**Bottom line:** the marketplace is complete and green against a local chain,
but **nothing has been exercised on a real testnet** — the shipped artifact is
correctly config-gated to show an unconfigured marketplace until
`config/liteforge.json` gains deployed, verified addresses.

## 4. ZIP-vs-workspace diff (accidental-modification check)

`node qa/zip-diff.mjs` — pristine
`RareCognos-V2-Production-Verified.zip` vs workspace (excluding
`node_modules/`, `.vercel/`, `dist/`, `qa/`, `.grok/`, `.openai/`,
`test-logs/`, `artifacts/`): **136 identical (path+size), 9 modified, 15 added,
0 removed**.

Modified — attributed:

- `package.json`, `package-lock.json` — this pass's dependency work (rollback
  backups kept at `qa/package.json`, `qa/package-lock.json`).
- `scripts/grok-pwa-shared.mjs`, `scripts/grok-pwa-plugin.mjs` — injector fixes
  (earlier in this audit; 201/201 tests).
- `scripts/nft-compile.mjs` — this pass: dynamic solc version in the log line.
- `scripts/with-app-env.mjs` (+2 557 B), `src/lib/app-data/client.server.ts`
  (+83 B), `src/lib/nft/data.ts` (+18 B) — **pre-date this production-readiness
  pass** (present from the start; fully covered and green under the battery:
  typecheck, 260 unit tests incl. app-data suite, 8/8 contract scenarios,
  build + smoke).
- `public/contracts/RareCognos.json` — regenerated artifact from
  `npm run nft:compile` (bytecode metadata differs per compile; expected).

Added:

- `REMEDIATION_PLAN.md` (this file) and `qa/` verification harness
  (`built-smoke.mjs`, `audit-summary.mjs`, `zip-diff.mjs`, verdict + screenshots,
  `auth-on-variant/`, rollback manifests).
- **Stray temporary audit files (report only — not deleted, per instructions):**
  `audit-parser.ps1`, `parse-audit.ps1`, `parse-check.ps1`, `run-audit.ps1`,
  `run-audit.cjs`, `run-audit.js`, `run-parser-test.ps1`, `dump-raw-lines.ps1`
  (parser attempts), `audit-critical.json` (raw npm audit output, UTF-16 BOM —
  kept as evidence), `audit-error.txt` (0 B), `parse-log.txt`,
  `runtime-error.log`, and `scripts/resolve-check.mjs` (a Windows
  node_modules/.bin resolution diagnostic from the earlier wrapper work —
  legitimate but dev-only). All timestamped 10.11.2026 23:45–23:58, i.e. before
  this pass. Safe to delete at hand-off; `audit-critical.json` worth archiving
  first.
- `NFT-HANDOFF.md`: identical to the ZIP entry (17 078 B) — the earlier
  accidental overwrite was restored byte-exact.

## 5. Remaining work, ordered

1. **better-auth 1.7 migration** (unblocks the only applicable critical,
   GHSA-965c-763c-88jm): follow §1's map; requires reworking the popup flow +
   `authPopupPlugin` + gate-session hook-order verification; test with the
   platform-injected broker env.
2. **wagmi 3.7.11 + viem companion** major: clears the connectors tree
   (moderates + `uuid`/`query-string` highs); re-run full `nft:*` battery.
3. **sharp 0.35.5** with a rebuilt upload-service Docker image.
4. **Deploy LiteForge testnet contracts** with the gated `npm run nft:deploy`
   workflow (preflight → gated deploy → verification prep → `verified:true`),
   then run the **two-wallet testnet acceptance** (mint A → list → buy B;
   cancel; reprice; ownership) — full package and manual steps in §6.
5. Production hosting for the upload service (separate HTTPS host + persistent
   disk) and `VITE_UPLOAD_API_URL` wiring.
6. Clean the stray audit files (§4) after archiving `audit-critical.json`.

## 6. LiteForge testnet integration package (this phase)

Status: package built and verified locally; **nothing deployed, signed or
spent** (per instructions). Network facts below were established with read-only
RPC calls only.

| Artifact | What it does | Verification evidence |
| --- | --- | --- |
| `scripts/nft-preflight.mjs` (`npm run nft:preflight`) | Keyless preflight: chain-id, block liveness, fees, optional `DEPLOYER_ADDRESS` balance/EOA checks, artifact + compiler-input presence, `config/liteforge.json` state, app-gate consistency. Exit 0/1; verdict written to `qa/preflight-verdict.json`. | Executed this pass — READY (verdict committed under `qa/`) |
| `scripts/nft-deploy.mjs` (`npm run nft:deploy`) | Real deployer, double-gated (`NFT_DEPLOYER_KEY` **and** `LITEFORGE_DEPLOY_CONFIRM=YES`; `--dry-run` needs only the key and sends nothing). Pre-send: chain-id check, creation simulation, gas + balance estimate, 2× margin warning. Key never printed; redacted from every error. `--write-config` records addresses + tx hashes (`verified` stays false). | NOT executed — run without the env controls refuses with usage (verified); requires owner action |
| `scripts/nft-verify-prep.mjs` (`npm run nft:verify-prep`) | Emits `artifacts/verification/{standard-json-input.json, verification-meta.json, README.md}`: exact solc version/settings, runtime keccak256 fingerprints, ABI-encoded constructor args (`--collection 0x..`), three verification paths (explorer UI / Etherscan-style API / Sourcify) + post-verification checklist. | Executed this pass (keyless); fingerprints recorded pre-deploy |
| `qa/testnet-acceptance.plan.md` | Two-wallet test plan: mint, approve, list, buy, cancel, reprice (re-list), ownership checks + revert cases, each mapped to exact assertion flags. | Plan (cannot execute without deployed contracts) |
| `qa/testnet-acceptance.mjs` (`npm run testnet:acceptance`) | READ-ONLY on-chain state verifier: public RPC reads only, no key path exists in the script; dumps collection/market/token/listing state; asserts `--expect-*` flags. | Executed in dump mode pre-deploy: correctly refuses with instructions |
| `BRIDGE-ARCHITECTURE.md` | Technical architecture for a REAL cross-chain NFT bridge: required contracts, relayer design, trust assumptions per option, security risks, phased rollout. **Explicitly NOT IMPLEMENTED** — no bridge code added anywhere. | Document only |

### Network facts established (live RPC, read-only, 2026-11-11)

- `https://liteforge.rpc.caldera.xyz/http` → `eth_chainId` 0x1159 (**4441** — matches `config/liteforge.json` and `src/lib/nft/config.ts`).
- Client: `nitro/v3.11.4-…/go1.25.14` — an Arbitrum **Nitro** rollup (Caldera-hosted LitVM LiteForge).
- Fees: `eth_gasPrice` 10,000,000 wei (0.01 gwei); `eth_feeHistory` baseFee flat 0.01 gwei with 0 priority reward; `eth_maxPriorityFeePerGas` 0.
- Chain is live: block ~69.86M and advancing (two-sample check).

### Exact remaining manual steps (owner-run, in order)

1. Fund a dedicated testnet EOA and note its address (faucet location to be confirmed — blocker B4).
2. `npm run nft:preflight` with `DEPLOYER_ADDRESS=0x…` set — must print READY (keyless).
3. `export NFT_DEPLOYER_KEY=…`, `export LITEFORGE_DEPLOY_CONFIRM=YES`, `npm run nft:deploy -- --dry-run` — review estimates; then `npm run nft:deploy -- --write-config`.
4. `npm run nft:verify-prep -- --collection 0x<collection>`; verify both contracts on the explorer (paths in `artifacts/verification/README.md`); compare explorer runtime bytecode against the fingerprints in `verification-meta.json`.
5. Set `verified: true` + `verificationUrls` in `config/liteforge.json` — the app gate (`configured` in `src/lib/nft/config.ts`) then passes.
6. Execute `qa/testnet-acceptance.plan.md` step by step (wallet A: mint/approve/list/cancel/reprice; wallet B: buy), asserting each state with `npm run testnet:acceptance -- --expect-…`.
7. Update §3's "LiteForge testnet contracts" row from NOT DEPLOYED to TESTED ON TESTNET with tx URLs.

### Blockers (honest list)

- **B1 — no funded deployer key exists in this environment** (and none may be generated here): deploy + acceptance require the owner's funded testnet key; the script refuses without it by design.
- **B2 — explorer verification surface unhealthy from this environment**: `liteforge.explorer.caldera.xyz` served HTTP 500 on root and `/api/v2/*`, and HTTP 400 on the Etherscan-style `/api` (2026-11-11). Verification must run from a browser or CI when healthy; all three paths are pre-built in `artifacts/verification/README.md`.
- **B3 — no authoritative third-party registry entry for chain 4441**: `ethereum-lists/chains` has no `eip155-4441` (HTTP 404), so chainlist does not list it. Network identity is established from the live RPC (chain id + Nitro client) and the shipped config; keep under review when LiteForge publishes official docs.
- **B4 — web search was unavailable in this session** (integration cancelled repeatedly), so LiteForge's official documentation and faucet page could not be cited; the faucet location is owner-side knowledge for step 1.
- **B5 — bridge intentionally NOT implemented**: see `BRIDGE-ARCHITECTURE.md`; the app gains no bridge surface in this phase, and no placeholder bridge code was added.
- **B6 — auth stays OFF** on `better-auth ~1.6.34` until the 1.7 migration (§1) is executed; the only applicable critical there is GHSA-965c-763c-88jm on the auth-ON variant.
