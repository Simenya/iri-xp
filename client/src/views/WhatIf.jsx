import React, { useMemo } from "react";
import { TrendChart } from "../components/charts.jsx";
import { Card, CountryPicker, RulerBadge, Seg, StopSlider } from "../components/ui.jsx";
import { GROUPS, eq } from "../lens.js";
import { METHOD_COLOR, fmt, signed } from "../util.js";

const ALL = [...GROUPS.moving, ...GROUPS.fixed];
const OWN_STOPS = [0, 0.25, 0.5, 1, 1.5, 2];              // 0 plus the five exported shock sizes
const sd = (v) => (v === 0 ? "0" : String(v));
const fmtChange = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1)}`;

/** Score and rank of country c under every method for each stop of a scenario. */
function curves(D, scenario, c) {
  const out = {};
  if (scenario === "world") {
    const W = D.world;
    for (const m of ALL) out[m] = { score: W.score[m][c], rank: W.rank[m][c] };
  } else {
    const t = D.latest;
    for (const m of ALL) {
      const base = D.scores[m][t];
      const score = [], rank = [];
      OWN_STOPS.forEach((s) => {
        let own = 0, d = null;
        if (s > 0) { const si = D.shock.sizes.indexOf(s); own = D.shock.own[m][c][si]; d = D.shockDeltas(m, c, si); }
        const mine = base[c] + own; let r = 1;
        for (let j = 0; j < D.nC; j++) if (j !== c && base[j] + (d ? d[j] : 0) > mine + 1e-6) r++;
        score.push(mine); rank.push(r);
      });
      out[m] = { score, rank };
    }
  }
  return out;
}

export default function WhatIf({ D, S, set, openMethod }) {
  const c = D.idx[S.country] ?? D.idx.KE, name = D.countries[c].name;
  const world = S.scn === "world";
  const stops = world ? D.world.shifts : OWN_STOPS;
  const step = Math.min(S.step, stops.length - 1);
  const cv = useMemo(() => curves(D, S.scn, c), [D, S.scn, c]);
  const measure = S.wiMeasure;
  const labels = stops.map((s) => `${s} SD`);

  const ser = (m) => {
    const sc = cv[m].score, rk = cv[m].rank;
    return measure === "rank" ? rk : sc.map((v) => (v - sc[0]) * eq(D, m));
  };
  const all = ALL.map((m) => ser(m)).flat();
  const domain = [Math.min(...all), Math.max(...all)];
  const fmtY = measure === "rank" ? (v) => `#${Math.round(v)}` : fmtChange;
  const mk = (m) => ({ id: m, label: D.methods[m].short, color: METHOD_COLOR[m], values: ser(m), width: m === "z" ? 3.6 : 2.4 });
  const xTicks = stops.map((s, i) => ({ i, text: sd(s) })).filter((_, i) => stops.length <= 6 || i % 2 === 0);
  const sdText = world ? "SD" : "SD";

  const row = (m) => {
    const sc = cv[m].score, rk = cv[m].rank;
    return { m, s0: sc[0], s1: sc[step], r0: rk[0], r1: rk[step], ds: sc[step] - sc[0], dr: rk[0] - rk[step] };
  };

  const panel = (g) => (
    <Card className={`s6 panel ${g}`}>
      <div className="cardhead" style={{ marginBottom: 6 }}>
        <div><h3 className="ct">{g === "moving" ? "Moving rulers" : "Fixed rulers"}</h3></div><RulerBadge ruler={g} />
      </div>
      <TrendChart labels={labels} series={GROUPS[g].map(mk)} yDomain={domain} invert={measure === "rank"} format={fmtY} zero={measure === "change" ? 0 : undefined}
        zeroLabel={measure === "change" ? "no change" : undefined} xTicks={xTicks} mark={step} onPick={(i) => set({ step: i })} height={280} animateKey={`${c}${S.scn}${measure}${g}`}
        tipTitle={(i) => `${world ? "Rest of world" : name} +${stops[i]} ${sdText}`}
        ariaLabel={`${name}: ${measure} under ${g} rulers as ${world ? "the rest of the world" : "the country"} improves`} />
      <table className="legtable">
        <thead><tr><th>Method</th><th className="c">Score</th><th className="c">Rank</th></tr></thead>
        <tbody>
          {GROUPS[g].map((m) => {
            const r = row(m);
            return (
              <tr key={m}>
                <td><span className="dot" style={{ background: METHOD_COLOR[m], marginRight: 8 }} /><button type="button" className="mname" onClick={() => openMethod(m)}>{D.methods[m].short}</button></td>
                <td className="c num">{fmt(r.s0, 1)} → <b>{fmt(r.s1, 1)}</b> <span className={`pchip ${r.ds > 0.05 ? "up" : r.ds < -0.05 ? "down" : "flat"}`}>{Math.abs(r.ds) < 0.05 ? "no change" : `${r.ds > 0 ? "▲" : "▼"} ${Math.abs(r.ds).toFixed(1)}`}</span></td>
                <td className="c num">#{r.r0} → <b>#{r.r1}</b> <span className={`pchip ${r.dr > 0 ? "up" : r.dr < 0 ? "down" : "flat"}`}>{r.dr === 0 ? "•" : `${r.dr > 0 ? "▲" : "▼"} ${Math.abs(r.dr)}`}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );

  const rc = row("cur"), rz = row("z");
  return (
    <>
      <div className="ctl">
        <CountryPicker D={D} value={c} onChange={(i) => set({ country: D.countries[i].code })} label="Country" />
        <Seg label="Scenario" value={S.scn} onChange={(v) => set({ scn: v, step: v === "world" ? 4 : 3 })}
          options={[{ key: "world", label: "Rest of the world improves" }, { key: "own", label: `${name} improves` }]} />
        <Seg small label="Measure" value={measure} onChange={(v) => set({ wiMeasure: v })} options={[{ key: "change", label: "Score change" }, { key: "rank", label: "Rank" }]} />
      </div>
      <div className="page">
        <section className="card hero2">
          <div className="eyebrow">{world ? `${name} stands still while every other country improves` : `${name} improves while every other country stands still`} · 2025 Q4</div>
          <div className="row wrap" style={{ gap: 22, margin: "10px 0 6px" }}>
            <div className="flex1" style={{ minWidth: 260 }}>
              <div className="cs" style={{ marginBottom: 4 }}>{world ? "How much the rest of the world improves" : `How much ${name} improves`} (typical gaps between countries, on all 27 indicators)</div>
              <StopSlider stops={stops.map(sd)} value={step} onChange={(v) => set({ step: v })} label="Size of the improvement" />
            </div>
          </div>
          <div className="kpis" style={{ marginTop: 16 }}>
            {[["cur", rc, "Today's IRI"], ["z", rz, "Recommended"]].map(([m, r, lab]) => (
              <div className="kpi" key={m}>
                <div className="row between wrap"><span className="kl"><span className="dot" style={{ background: METHOD_COLOR[m] }} /> {lab}: {D.methods[m].short}</span></div>
                <div className="kbig num">{fmt(r.s1, 1)}<small> from {fmt(r.s0, 1)}</small></div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`pchip ${r.ds > 0.05 ? "up" : r.ds < -0.05 ? "down" : "flat"}`}>{Math.abs(r.ds) < 0.05 ? "score unchanged" : `${r.ds > 0 ? "▲" : "▼"} ${Math.abs(r.ds).toFixed(1)} points`}</span>
                  <b className="num" style={{ fontSize: 17 }}>#{r.r1}</b><span className="cs">from #{r.r0}</span>
                  <span className={`pchip ${r.dr > 0 ? "up" : r.dr < 0 ? "down" : "flat"}`}>{r.dr === 0 ? "rank unchanged" : `${r.dr > 0 ? "▲" : "▼"} ${Math.abs(r.dr)} places`}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="grid" style={{ marginTop: 20 }}>{panel("moving")}{panel("fixed")}</div>
      </div>
    </>
  );
}
