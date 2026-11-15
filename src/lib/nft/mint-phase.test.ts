import assert from "node:assert/strict";
import test from "node:test";
import { eyed } from "../../data/eyed.ts";
import { isTimeout, txFailure } from "./mint-phase.ts";

const featured = ["02", "03", "04", "05", "06", "07", "08", "09"];

test("featured Eyed faces keep their contract indexes", () => {
  assert.equal(eyed.length, 9);
  assert.equal(eyed.findIndex((face) => face.id === "01"), 0);
  assert.equal(featured.length, 8);
  for (const id of featured) {
    assert.equal(eyed.findIndex((face) => face.id === id), Number(id) - 1);
    assert.notEqual(id, "01");
  }
  assert.equal(eyed.find((face) => face.id === "04")?.name, "Spire");
});

test("wallet rejection is not a failed receipt", () => {
  assert.equal(txFailure(Error("User rejected the request.")), "rejected");
  assert.equal(txFailure(Error("execution reverted")), "failed");
  assert.equal(isTimeout(Error("Request timed out.")), true);
  assert.equal(isTimeout(Error("User rejected the request.")), false);
});
