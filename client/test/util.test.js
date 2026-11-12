import { test } from "node:test";
import assert from "node:assert/strict";
import { minRanks, pearson, niceTicks, signed, fmt, pct } from "../src/util.js";

test("minRanks: 1 = highest, ties share the best rank", () => {
  assert.deepEqual(minRanks([10, 30, 20]), [3, 1, 2]);
  assert.deepEqual(minRanks([100, 100, 90, 100]), [1, 1, 4, 1]);
  assert.deepEqual(minRanks([5, 5 + 1e-9]), [1, 1]);
});
test("pearson of identical rankings is 1, of reversed rankings is -1", () => {
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [1, 2, 3, 4]) - 1) < 1e-12);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-12);
});
test("niceTicks covers the range with round numbers", () => {
  const t = niceTicks(-7.3, 8.1, 4);
  assert.ok(t[0] <= -7.3 && t.at(-1) >= 8.1);
  assert.ok(t.every((v) => Math.abs(v - Math.round(v)) < 1e-9));
});
test("formatting", () => {
  assert.equal(signed(2.34, 1), "+2.3"); assert.equal(signed(-2.34, 1), "−2.3"); assert.equal(fmt(null), "–"); assert.equal(fmt(1234.5, 1), "1,234.5");
});
test("pct rounds an exact half to the even whole number, like the deck", () => {
  assert.equal(pct(0.705), "70%"); assert.equal(pct(0.715), "72%"); assert.equal(pct(0.9389), "94%"); assert.equal(pct(0.81), "81%"); assert.equal(pct(0.9304, 1), "93.0%");
});
