// Locks the dashboard's data to the final validation presentation, so a wrong number cannot be published.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { minRanks, pct } from "../src/util.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const json = (n) => JSON.parse(readFileSync(join(dir, n), "utf8"));
const mc = json("mc.json"), shock = json("shock.json"), scores = json("scores.json"), countries = json("countries.json");
const tests = json("report_tests.json"), methods = json("methods_info.json");
const bin = readFileSync(join(dir, "shock.bin"));

// the figures printed in the deck: Monte Carlo slides (direction, rank band, new records) and the shock chart
const DECK = {
  dir:   { z: 94, fg: 93, pool: 93, dtf: 92, dtt: 89, ampi: 93, dea: 93, cur: 81, dyn: 85, mdtf: 84 },
  band:  { z: 9.4, fg: 9.6, pool: 9.9, dtf: 11.1, dtt: 11.1, ampi: 6.6, dea: 11.9, cur: 13.0, dyn: 9.8, mdtf: 11.0 },
  noise: { ampi: 3.7, z: 3.7, dea: 3.8, fg: 3.8, pool: 4.2, dtf: 4.5, dyn: 4.7, dtt: 4.9, mdtf: 5.0, cur: 6.6 },
  up:    { z: 100, fg: 79, pool: 100, dtf: 0, dtt: 70, ampi: 76, dea: 61, cur: 11, dyn: 19, mdtf: 19 },
  shock: { mdtf: 56, dyn: 50, cur: 41, dea: 31, pool: 0, z: 0, dtf: 0, fg: 0, dtt: 0, ampi: 0 },
};
const ids = Object.keys(DECK.dir);

test("ten methods, 180 countries, 28 quarters", () => {
  assert.equal(countries.length, 180);
  assert.equal(scores.quarters.length, 28);
  assert.equal(ids.length, 10);
  for (const m of ids) {
    assert.equal(scores.scores[m].length, 28, m);
    assert.equal(scores.scores[m][0].length, 180, m);
    assert.ok(methods[m], `method text for ${m}`);
  }
});

test("Monte Carlo results match the deck (rounded as printed)", () => {
  for (const m of ids) {
    const x = mc.methods[m];
    assert.equal(pct(x.dir), `${DECK.dir[m]}%`, `${m} direction`);
    assert.equal(+x.band.toFixed(1), DECK.band[m], `${m} rank band`);
    assert.equal(+x.noisePct.toFixed(1), DECK.noise[m], `${m} score noise`);
    assert.equal(pct(x.record.up), `${DECK.up[m]}%`, `${m} credits a new record`);
    assert.equal(`${Math.round(x.shock.meanMaxPct)}`, `${DECK.shock[m]}`, `${m} random shocks`);
  }
});

test("the z-score cap results back the deck's claims", () => {
  assert.ok(mc.zcap.none.gainPct > 119 && mc.zcap.none.gainPct < 120, "+120% at twice the record");
  for (const cap of ["3", "4", "5"]) {
    assert.ok(Math.abs(mc.zcap[cap].gainPct) < 1e-6, `cap ${cap} removes the gain`);
    assert.ok(mc.zcap[cap].dir > 0.92 && mc.zcap[cap].dir < 0.94, `cap ${cap} keeps direction near 93%`);
  }
  assert.ok(Math.abs(mc.zcap["3"].rho - 0.989) < 0.0006, "a cap of 3 lifts rank agreement to 0.989");
});

test("shock grid: frozen methods never move another country; the Lithuania case matches the report", () => {
  assert.equal(shock.frozenWorst, 0);
  const lt = countries.findIndex((c) => c.code === "LT"), si = shock.sizes.indexOf(1);
  assert.equal(shock.moved.cur[lt][si], 179);
  assert.ok(Math.abs(shock.maxAbs.cur[lt][si] - 7.272) < 0.002);
  assert.equal(shock.moved.dea[lt][si], 169);
  for (const m of ["z", "fg", "pool", "dtf", "dtt", "ampi"]) assert.equal(shock.moved[m][lt][si], 0, m);
  // the z-score is shown as 50 + 10z, so +1 SD on every indicator adds exactly 10 points to the improved country
  assert.ok(Math.abs(shock.own.z[lt][si] - 10) < 1e-6);
});

test("shock.bin has the size shock.json promises", () => {
  assert.equal(bin.length, shock.shape.reduce((a, b) => a * b, 1) * 2);
});

test("report tests match the deck's charts", () => {
  assert.equal(tests.test1.broad.cur, 0.511); assert.equal(tests.test1.leader.pool, 0.536);
  assert.equal(tests.test1.broad.z, 0); assert.equal(tests.test1.leader.fg, 0);
  assert.equal(tests.test2.corr.z, 0.986); assert.equal(tests.test2.bigMovers.z, 31); assert.equal(tests.test2.bigMovers.fg, 44);
  assert.equal(tests.test3.moved.dea, 10); assert.equal(tests.test3.rewrites.pool, true);
  assert.equal(tests.test4.ties.cur, 33); assert.equal(tests.test4.ties.fg, 24);
});

test("the app's ranking function reproduces the validated 2025 Q4 ranks for the focus countries", () => {
  const ref = JSON.parse(readFileSync(join(dir, "..", "..", "..", "pipeline", "reference", "results7.json"), "utf8")).res;
  const t = scores.quarters.indexOf("2025 Q4");
  for (const m of ids.filter((x) => x !== "dea")) {          // Malmquist / DEA has many exact ties, so its ranks are compared in the pipeline
    const r = minRanks(scores.scores[m][t]);
    for (const code of ["IS", "SG", "NL", "TZ", "CF"]) {
      const i = countries.findIndex((c) => c.code === code);
      assert.equal(r[i], ref[m].focus[code].rank, `${m} ${code}`);
    }
  }
});

// ------------------------------------------------------------------ the Country and What-if views
const world = json("world.json"), ruler = json("ruler.json");
const FIXED = ["z", "fg", "pool", "dtf", "dtt", "ampi"], MOVING = ["cur", "dyn", "mdtf", "dea"];

test("what-if: a country that stands still keeps its score under every fixed ruler, whatever the rest of the world does", () => {
  for (const m of FIXED) for (let c = 0; c < countries.length; c++) {
    const s = world.score[m][c];
    assert.ok(Math.max(...s) - Math.min(...s) < 0.01, `${m} ${countries[c].code}`);
  }
});

test("what-if: with no change in the world, every method returns the real 2025 Q4 score", () => {
  const t = scores.quarters.indexOf("2025 Q4");
  for (const m of [...FIXED, ...MOVING]) for (let c = 0; c < countries.length; c++)
    assert.ok(Math.abs(world.score[m][c][0] - scores.scores[m][t][c]) < 0.011, `${m} ${countries[c].code}`);
});

test("what-if: the current IRI punishes a country when the rest of the world improves", () => {
  const ke = countries.findIndex((c) => c.code === "KE");
  const s = world.score.cur[ke];
  assert.ok(s.at(-1) < s[0] - 10, "Kenya's current IRI score falls by more than 10 points");
  for (let i = 1; i < s.length; i++) assert.ok(s[i] <= s[i - 1] + 1e-9, "never rises");
});

test("country view: holding the ruler at its starting quarter reproduces the real score at that quarter", () => {
  for (const m of ["cur", "dyn", "mdtf"]) ruler.baselines.forEach((b, k) => {
    for (let c = 0; c < countries.length; c++) assert.ok(Math.abs(ruler.held[m][k][b][c] - scores.scores[m][b][c]) < 0.011, `${m} ${b} ${c}`);
  });
});
