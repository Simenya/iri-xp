// Loads the exported data files and wraps them in a small query layer.
import { ALL, minRanks } from "./util.js";

const BASE = `${import.meta.env.BASE_URL}data/`;
const getJson = async (name) => {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
};

export async function loadData() {
  const [countries, scoreFile, mc, shock, methods, tests, capTies, world, ruler] = await Promise.all([
    getJson("countries.json"), getJson("scores.json"), getJson("mc.json"), getJson("shock.json"),
    getJson("methods_info.json"), getJson("report_tests.json"), getJson("cap_ties.json"),
    getJson("world.json"), getJson("ruler.json"),
  ]);
  const buf = await (await fetch(`${BASE}shock.bin`)).arrayBuffer();
  const vec = new Int16Array(buf);
  const nC = countries.length, nS = shock.sizes.length;
  if (vec.length !== shock.shape.reduce((a, b) => a * b, 1)) throw new Error("shock.bin does not match shock.json");
  const quarters = scoreFile.quarters;
  const scores = scoreFile.scores;
  const idx = Object.fromEntries(countries.map((c, i) => [c.code, i]));
  const rankCache = new Map();

  const D = {
    countries, quarters, scores, mc, shock, methods, tests, capTies, world, ruler, idx, nC, nS,
    annual: new Set(scoreFile.annual),
    latest: quarters.length - 1,
    /** Ranks of all countries under method m in quarter t (1 = best; ties share a rank). */
    ranks(m, t) {
      const key = `${m}|${t}`;
      if (!rankCache.has(key)) rankCache.set(key, minRanks(scores[m][t]));
      return rankCache.get(key);
    },
    /** Score change of every other country when country c improves by sizes[si] (frozen constants), in points. Own entry is 0. */
    shockDeltas(m, c, si) {
      const mi = shock.movingMethods.indexOf(m);
      const out = new Float64Array(nC);
      if (mi < 0) return out;
      const off = ((mi * nC + c) * nS + si) * nC;
      for (let j = 0; j < nC; j++) out[j] = vec[off + j] / shock.scale;
      return out;
    },
  };
  return D;
}

export const methodIds = ALL;
