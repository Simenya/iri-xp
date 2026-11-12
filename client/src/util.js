// Shared constants and helpers. Colours follow the validation deck: orange = moving ruler, light blue = frozen ruler, navy = base-year z-score.

export const MOVING = new Set(["cur", "dyn", "mdtf", "dea"]);
export const ALL = ["cur", "dyn", "mdtf", "dea", "pool", "z", "dtf", "fg", "dtt", "ampi"];      // order of the data files
export const CHIP_ORDER = ["cur", "z", "fg", "pool", "dtf", "dtt", "ampi", "dea", "dyn", "mdtf"];
export const SCORECARD_ORDER = ["z", "fg", "pool", "dtf", "dtt", "ampi", "dea", "cur", "dyn", "mdtf"];   // the deck's table order, then the two untested variants

export const RULER = { moving: "#F97316", frozen: "#60A5FA", z: "#1E3A8A" };
export const METHOD_COLOR = {
  cur: "#F97316", dyn: "#E8A413", mdtf: "#D6453D", dea: "#8B4513",
  z: "#1E3A8A", fg: "#3B82F6", pool: "#0D9488", dtf: "#7C3AED", dtt: "#0891B2", ampi: "#64748B",
};
export const isMoving = (id) => MOVING.has(id);
export const barColor = (id) => (id === "z" ? RULER.z : isMoving(id) ? RULER.moving : RULER.frozen);
export const rulerOf = (id) => (isMoving(id) ? "moving" : "frozen");

export const GLOSSARY = {
  ruler: "The reference values a score is measured against. A moving ruler is recalculated from the latest data, so other countries can move your score. A frozen ruler is set once and never updated.",
  direction: "Whether a country's change from 2024 to 2025 keeps the same direction (up stays up, down stays down) when small random errors are added to the data. Higher is better.",
  band: "The range of ranks a country lands in for 90% of the simulated runs (5th to 95th percentile), averaged over all countries. Smaller means steadier ranks.",
  noise: "How much a country's score moves from the random errors alone, as a share of the typical gap between countries' scores. Smaller is better.",
  spread: "The typical gap between countries' scores under a method (the standard deviation of all countries' scores). Used so methods on different scales can be compared.",
  shock: "An artificial improvement given to one country, to see whether anyone else's score moves. Sizes are in 2019 standard deviations: 1 means a typical gap between countries.",
  monte: "Repeating a test many times with small random changes, to see how stable a result is. Here: 1,000 runs per method.",
  zscore: "How many typical gaps (2019 standard deviations) a value sits from the 2019 average. Shown to users as 50 + 10z, so 50 is the 2019 average of all countries.",
  cap: "A fixed limit on how extreme one indicator's z-score can be, for example no more than 3 typical gaps from the 2019 average. It is set once and never recalculated.",
  rankcorr: "How similar two rankings are: 1 means the same order of countries, 0 means no relationship.",
  tie: "Different countries receiving exactly the same score because the scale has a floor or a ceiling.",
};

export function fmt(v, d = 1) {
  if (v == null || !Number.isFinite(v)) return "–";
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
/** Percentage. A share that is exactly halfway (70.5%) rounds to the even whole number (70%), as the validation deck prints it. */
export function pct(v, d = 0) {
  if (v == null || !Number.isFinite(v)) return "–";
  const x = v * 100;
  if (d === 0 && Math.abs(x - Math.floor(x) - 0.5) < 1e-9) return `${2 * Math.round(x / 2)}%`;
  return `${fmt(x, d)}%`;
}
export const signed = (v, d = 1) => (v == null || !Number.isFinite(v) ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v), d)}`);

/** Competition ranking: 1 = highest score; equal scores share the best rank. */
export function minRanks(scores, tol = 1e-6) {
  const n = scores.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let r = 1;
    for (let j = 0; j < n; j++) if (scores[j] > scores[i] + tol) r++;
    out[i] = r;
  }
  return out;
}

export function std(a) {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

export function pearson(a, b) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}

export function niceTicks(min, max, count = 5) {
  if (!(max > min)) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(8)));
  return ticks;
}

export function pluralise(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
