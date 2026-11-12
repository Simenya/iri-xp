// Turns the exported data into the views a country page needs.
import { MOVING } from "./util.js";

export const GROUPS = { moving: ["cur", "dyn", "mdtf", "dea"], fixed: ["z", "fg", "pool", "dtf", "dtt", "ampi"] };
export const DEFAULT_HIDDEN = ["dtt", "ampi"];
export const FROM_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
export const baselineQuarter = (year) => (year - 2019) * 4;                 // Q1 of the year

/** Factor that puts a method's points on the current IRI's scale (equal typical gap between countries). */
export const eq = (D, m) => D.mc.methods.cur.sd / D.mc.methods[m].sd;

/** One method's series for a country from quarter b on (null before): score, rank, or change since b in current-IRI points. */
export function series(D, m, c, b, measure) {
  const sc = D.scores[m], f = eq(D, m);
  return D.quarters.map((_, t) => {
    if (t < b) return null;
    if (measure === "rank") return D.ranks(m, t)[c];
    if (measure === "score") return sc[t][c];
    return (sc[t][c] - sc[b][c]) * f;
  });
}

/** Headline numbers for a method, a country, a start quarter b and a selected quarter t. */
export function stats(D, m, c, b, t) {
  const sc = D.scores[m];
  let swing = 0, n = 0;
  for (let u = b + 1; u <= t; u++) { swing += Math.abs((sc[u][c] - sc[u - 1][c]) * eq(D, m)); n++; }
  return {
    score: sc[t][c], rank: D.ranks(m, t)[c], change: sc[t][c] - sc[b][c], changeEq: (sc[t][c] - sc[b][c]) * eq(D, m),
    rankChange: D.ranks(m, b)[c] - D.ranks(m, t)[c], swing: n ? swing / n : 0,
  };
}

/** Splits a country's score change since quarter b into the part from its own data and the part from the ruler moving. */
export function rulerSplit(D, m, c, b, t) {
  const total = D.scores[m][t][c] - D.scores[m][b][c];
  if (!MOVING.has(m)) return { total, own: total, ruler: 0 };
  const bi = D.ruler.baselines.indexOf(b);
  if (bi < 0 || !D.ruler.held[m]) return null;
  const held = D.ruler.held[m][bi][t][c];
  return { total, own: held - D.scores[m][b][c], ruler: D.scores[m][t][c] - held };
}

export function countryName(D, c) { return D.countries[c].name; }
