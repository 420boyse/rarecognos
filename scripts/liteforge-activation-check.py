#!/usr/bin/env python3
"""LiteForge activation check — READ-ONLY. Signs nothing, sends nothing.

Discovers the two deployed contracts from the deployer's transaction history
(nonces 0..N-1), verifies bytecode fingerprints, name/version, treasury,
owner, and the fixed 25 bps fee, and writes qa/activation-verdict.json.

Usage:
  python3 scripts/liteforge-activation-check.py
  python3 scripts/liteforge-activation-check.py --collection 0x.. --market 0x..
  python3 scripts/liteforge-activation-check.py --deployer 0x..
"""
import argparse, json, sys, urllib.request

RPC = "https://rpc.testnet.liteforge.zeeve.net"
EXPLORER = "https://explorer.testnet.liteforge.zeeve.net"
CHAIN_ID = 4441
DEFAULT_DEPLOYER = "0xffd9618e19fb7f74169f75343550e14b74d19cb3"

def rpc(method, params=None):
    params = params or []
    data = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.load(r)
    if "error" in resp:
        raise Exception(str(resp["error"])[:300])
    return resp["result"]

def keccak256(data: bytes) -> str:
    try:
        from sha3 import keccak_256  # pysha3
        return "0x" + keccak_256(data).hexdigest()
    except ImportError:
        pass
    try:
        import _sha3  # PyPy / CPython 3.6+
        return "0x" + _sha3.keccak_256(data).hexdigest()
    except Exception:
        pass
    # Fallback: hashlib in Py3.6+ has no keccak; use sha3 if available
    try:
        import hashlib
        h = hashlib.new("sha3_256", data)
        # NOTE: sha3_256 != keccak_256 — only used as last resort for logging
        return h.hexdigest()
    except Exception as e:
        return f"keccak-unavailable:{e}"

# Check keccak availability
try:
    import _sha3
    HAS_KECCAK = True
    def k256(b): return "0x" + _sha3.keccak_256(b).hexdigest()
except Exception:
    try:
        from Crypto.Hash import keccak as _k
        HAS_KECCAK = True
        def k256(b):
            h = _k.new(digest_bits=256); h.update(b); return "0x" + h.hexdigest()
    except Exception:
        HAS_KECCAK = False
        def k256(b): return "0x" + keccak256(b)
