import test from "node:test";
import assert from "node:assert/strict";
import { assertFrontendEnvSafe } from "./frontend-env-guard.mjs";
test("server-only credentials allowed, accidental client exposure rejected without logging values", () => {
  const secret = "synthetic-test-credential";
  assert.doesNotThrow(() => assertFrontendEnvSafe({ PINATA_JWT: secret, VITE_WALLETCONNECT_PROJECT_ID: "public-project-id" }));
  for (const env of [
    { VITE_PINATA_JWT: secret },
    { VITE_PINATA_API_KEY: secret },
    { PINATA_JWT: secret, VITE_OTHER: "prefix=" + secret },
    { VITE_OTHER: "eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.synthetic" },
  ]) {
    assert.throws(() => assertFrontendEnvSafe(env), error => {
      assert.match(error.message, /Unsafe public environment/);
      assert.ok(!error.message.includes(secret));
      return true;
    });
  }
});
