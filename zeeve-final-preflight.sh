#!/bin/bash
# Zeeve preflight verification (final) — uses ZEEVE_RPC env to override the configured RPC
cd /Users/efecan/Desktop/RareCognos-V2-Production-Verified/RareCognos-V2-Production-Verified/RareCognos-V2
export ZEEVE_RPC="https://rpc.testnet.liteforge.zeeve.net"
export ZEEVE_RPC2="https://rpc.testnet.liteforge.zeeve.net"
export PATH="/Users/efecan/Documents/Codex/2026-11-10/mevcut-rarecognos-tanstack-start-react-ve/work/runtime/node-v20.19.0-darwin-arm64/bin:$PATH"
node scripts/nft-preflight.mjs 2>&1 | tee /tmp/migrate-verify/zeeve-final-preflight.log
echo "ZEEVE_PREFLIGHT_EXIT=$?"
