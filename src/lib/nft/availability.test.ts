import assert from "node:assert/strict";
import test from "node:test";
import { availabilityLabel, dropStatus } from "./availability.ts";

test("mint status waits for the contract read", () => {
  assert.equal(dropStatus({ live: false }), "soon");
  assert.equal(dropStatus({ live: true }), "checking");
  assert.equal(dropStatus({ live: true, priceError: true }), "unavailable");
  assert.equal(
    dropStatus({ live: true, price: 1n, supply: 100n, minted: 0n, trackMinted: true }),
    "open",
  );
  assert.equal(
    dropStatus({ live: true, price: 1n, supply: 100n, minted: 100n, trackMinted: true }),
    "sold-out",
  );
  assert.equal(availabilityLabel("checking"), "Checking availability");
  assert.equal(availabilityLabel("unavailable"), "Status unavailable");
  assert.equal(availabilityLabel("open"), "Mint open");
});
