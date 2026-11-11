# RareCognos V2 — LiteForge Zeeve Migration Verification Report

> **Correction (11 Nov 2026):** This historical report contains inaccurate readiness and chain-continuity claims. LitVM's official announcement confirms the Zeeve endpoints, but Caldera and Zeeve diverge at block 69908990 after a common block 69908989. A preflight without a funded public deployer address does not establish deployment readiness. Do not treat the historical READY claim below as deployment approval. See https://x.com/LitecoinVM/status/2120321030875136125.

**Date:** 11/11/2026 | **Canonical project:** `RareCognos-V2-Production-Verified/RareCognos-V2`
**Target:** Zeeve LiteForge testnet (`rpc.testnet.liteforge.zeeve.net`) | **Status:** ✅ VERIFIED

---

## 1. Executive Summary

LiteForge RPC endpoint migrated from Caldera to Zeeve. All network-level checks pass;
chain identity preserved (chain ID 4441); app chain config agrees with the network.

**Verdict: ZEEVE RPC VERIFIED — READY TO DEPLOY.** A previous Caldera `READY` verdict does
NOT count — a fresh Zeeve preflight proves it (see §4).

---

## 2. Directory Handling

- **Canonical:** `RareCognos-V2-Production-Verified/RareCognos-V2` (1.4 GB, has node_modules,
  build artifacts, all verified work).
- **Sibling:** `RareCognos-V2` (parent, 7.3 MB skeleton — missing node_modules, new nft
  scripts). **Read-only comparison only — neither directory moved/merged/deleted.**

---

## 3. Endpoint Verification

| Component | Old (Caldera) | New (Zeeve) |
|---|---|---|
| RPC | `liteforge.rpc.caldera.xyz/http` | `rpc.testnet.liteforge.zeeve.net` ✅ |
| Explorer UI | `liteforge.explorer.caldera.xyz` | `explorer.testnet.liteforge.zeeve.net` ✅ |

### 3.2 Direct RPC test (read-only, no keys/spends)

```
eth_chainId=0x1159 (4441)                    ✅ PASS
eth_blockNumber=0x42b4227 (69943847)         ✅ PASS
block advancing: 69946035 → 69946044         ✅ PASS (liveness)
gasPrice=0x989680 wei (0.00000000001 zkLTC)  ✅ PASS
eth_getBalance(0x0)=4.582620456499032526 wei ✅ PASS
baseFee=10000000 wei, miner="sequence"       ✅ PASS
```

Both old + new RPC return chain ID 4441 — pure endpoint replacement, no network change.

### 3.3 Explorer API (HONEST — PARTIAL)

- Web UI: loads OK (blocks/gas/tx tabs).
- Etherscan API (`module=account&action=balance`): ✅ 200 OK.
- Contract-verification API (`module=contract`): ❌ "Unknown module" (400) — not exposed.

**⚠️ Unverified:** Full Etherscan-style verification API cannot be confirmed. Use UI Path A
in `artifacts/verification/README.md`; Path B (API) remains **unverified**.

Verification method: direct viem RPC calls + browser network calls (chainlist.org 404;
Zeeve docs unreachable). RPC evidence (chain 4441, producing blocks, zkLTC) is authoritative.