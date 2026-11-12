import React, { useMemo, useState } from "react";
import { Sparkline, SplitBars, TrendChart } from "../components/charts.jsx";
import { Card, CountryPicker, RulerBadge, Seg } from "../components/ui.jsx";
import { DEFAULT_HIDDEN, FROM_YEARS, GROUPS, baselineQuarter, rulerSplit, series, stats } from "../lens.js";
import { METHOD_COLOR, fmt, signed } from "../util.js";

const ALL = [...GROUPS.moving, ...GROUPS.fixed];
const MEASURES = [{ key: "change", label: "Change since start" }, { key: "rank", label: "Rank" }, { key: "score", label: "Score" }];

const fmtChange = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1)}`;
const Chip = ({ v, unit = "", up = true }) => (v == null ? null : <span className={`pchip ${v > 0 ? "up" : v < 0 ? "down" : "flat"}`}>{v > 0 ? "▲" : v < 0 ? "▼" : "•"} {v > 0 ? "+" : v < 0 ? "−" : ""}{Math.abs(v).toFixed(1)}{unit}</span>);
const PlacesChip = ({ v }) => (<span className={`pchip ${v > 0 ? "up" : v < 0 ? "down" : "flat"}`}>{v > 0 ? "▲" : v < 0 ? "▼" : "•"} {Math.abs(v)} {Math.abs(v) === 1 ? "place" : "places"}</span>);

export default function Country({ D, S, set, openMethod }) {
  const [hidden, setHidden] = useState(DEFAULT_HIDDEN);
  const [split, setSplit] = useState("cur");
  const [copied, setCopied] = useState(false);
  const c = D.idx[S.country] ?? D.idx.KE, name = D.countries[c].name;
  const b = baselineQuarter(S.from);
  const t = Math.min(D.latest, Math.max(b + 1, S.quarter ?? D.latest));
  const measure = S.measure;
  const visible = ALL.filter((m) => !hidden.includes(m));
  const toggle = (m) => setHidden(hidden.includes(m) ? hidden.filter((x) => x !== m) : [...hidden, m]);

  const ser = useMemo(() => Object.fromEntries(ALL.map((m) => [m, series(D, m, c, b, measure)])), [D, c, b, measure]);
  const st = useMemo(() => Object.fromEntries(ALL.map((m) => [m, stats(D, m, c, b, t)])), [D, c, b, t]);

  const vals = visible.flatMap((m) => ser[m]).filter(Number.isFinite);
  const domain = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  const fmtY = measure === "rank" ? (v) => `#${Math.round(v)}` : measure === "change" ? fmtChange : (v) => fmt(v, 0);
  const mk = (m) => ({ id: m, label: D.methods[m].short, color: METHOD_COLOR[m], values: ser[m], width: m === "z" ? 3.6 : 2.4 });

  const cur = st.cur, z = st.z;
  const splitCur = rulerSplit(D, "cur", c, b, t);
  const total = splitCur?.total ?? 0, own = splitCur?.own ?? 0, ruler = splitCur?.ruler ?? 0;
  const ownShare = Math.abs(own) + Math.abs(ruler) > 0 ? Math.abs(own) / (Math.abs(own) + Math.abs(ruler)) : 1;

  const splitRows = useMemo(() => {
    const rows = [];
    for (let u = b + 1; u <= D.latest; u++) {
      const r = rulerSplit(D, split, c, b, u);
      rows.push({ label: D.quarters[u], tick: D.quarters[u].endsWith("Q1") ? D.quarters[u].slice(0, 4) : null, a: r.own * 1, b: r.ruler * 1 });
    }
    return rows;
  }, [D, c, b, split]);

  const downloadCsv = () => {
    const head = ["Quarter", ...ALL.flatMap((m) => [`${D.methods[m].short} score`, `${D.methods[m].short} rank`])];
    const body = D.quarters.map((q, u) => [q, ...ALL.flatMap((m) => [D.scores[m][u][c], D.ranks(m, u)[c]])]);
    const text = [head, ...body].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `iri-methods-${D.countries[c].code}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const share = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ } };

  const panel = (g) => {
    const ids = GROUPS[g];
    const moving = g === "moving";
    return (
      <Card className={`s6 panel ${g}`}>
        <div className="cardhead" style={{ marginBottom: 6 }}>
          <div><h3 className="ct">{moving ? "Moving rulers" : "Fixed rulers"}</h3><p className="cs">{moving ? "Reset every quarter as other countries move" : "Reference values frozen, only the country's own data moves the score"}</p></div>
          <RulerBadge ruler={g} />
        </div>
        <TrendChart labels={D.quarters} series={ids.filter((m) => !hidden.includes(m)).map(mk)} yDomain={domain} invert={measure === "rank"} format={fmtY}
          zero={measure === "change" ? 0 : undefined} mark={t} onPick={(i) => i > b && set({ quarter: i })} height={290} animateKey={`${c}${b}${measure}${g}`}
          ariaLabel={`${name}: ${measure} under the ${g} rulers`} />
        <table className="legtable">
          <thead><tr><th>Method</th><th className="c">Score</th><th className="c">Rank</th><th className="c">Since {D.quarters[b]}</th><th className="c" title="Average quarter-to-quarter move, on the current IRI's scale">Quarterly swing</th></tr></thead>
          <tbody>
            {ids.map((m) => {
              const off = hidden.includes(m), x = st[m];
              return (
                <tr key={m} className={off ? "off" : ""}>
                  <td><button type="button" className="ltoggle" aria-pressed={!off} onClick={() => toggle(m)} title={off ? "Show on chart" : "Hide from chart"}><span className="dot" style={{ background: off ? "#D5D9DF" : METHOD_COLOR[m] }} /></button>
                    <button type="button" className="mname" onClick={() => openMethod(m)}>{D.methods[m].short}</button></td>
                  <td className="c num">{fmt(x.score, 1)}</td>
                  <td className="c num"><b>#{x.rank}</b></td>
                  <td className="c"><Chip v={x.change} /> <PlacesChip v={x.rankChange} /></td>
                  <td className="c num">{fmt(x.swing, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    );
  };

  return (
    <>
      <div className="ctl">
        <CountryPicker D={D} value={c} onChange={(i) => set({ country: D.countries[i].code })} label="Country" />
        <div className="field"><span className="lab">From</span>
          <select className="select" value={S.from} onChange={(e) => set({ from: +e.target.value, quarter: null })} aria-label="Start year">{FROM_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <div className="field"><span className="lab">Quarter</span>
          <select className="select" value={t} onChange={(e) => set({ quarter: +e.target.value })} aria-label="Quarter">{D.quarters.map((q, i) => i > b && <option key={q} value={i}>{q}</option>)}</select></div>
        <Seg label="Measure" value={measure} onChange={(v) => set({ measure: v })} options={MEASURES} small />
        <div className="navend" style={{ marginLeft: "auto" }}>
          <button className="ib" onClick={downloadCsv} title="Download this country's scores and ranks">CSV</button>
          <button className="ib" onClick={share} title="Copy a link to this view">{copied ? "✓" : "Link"}</button>
        </div>
      </div>

      <div className="page">
        <section className="card hero2">
          <div className="eyebrow">{name} · {D.quarters[t]} · since {D.quarters[b]}</div>
          <div className="kpis">
            {[["cur", "Today's IRI", "moving"], ["z", "Recommended", "frozen"]].map(([m, lab, r]) => {
              const x = st[m];
              return (
                <div className="kpi" key={m}>
                  <div className="row between wrap"><span className="kl"><span className="dot" style={{ background: METHOD_COLOR[m] }} /> {lab}: {D.methods[m].short}</span><RulerBadge ruler={r} /></div>
                  <div className="kbig num">{fmt(x.score, 1)}<small> {m === "z" ? "(50 = 2019 average)" : "/ 100"}</small></div>
                  <div className="row wrap" style={{ gap: 8 }}><b className="num" style={{ fontSize: 17 }}>#{x.rank}</b><span className="cs">of 180</span>
                    <Chip v={x.change} /> <PlacesChip v={x.rankChange} /></div>
                </div>
              );
            })}
          </div>
          {splitCur && (
            <div className="insight">
              <div className="split" aria-hidden="true"><span style={{ width: `${ownShare * 100}%`, background: "#3A82E4" }} /><span style={{ width: `${(1 - ownShare) * 100}%`, background: "#F97316" }} /></div>
              <p>
                On today's IRI, {name}'s score moved <b>{signed(total, 1)}</b>: <b style={{ color: "#2563C9" }}>{signed(own, 1)} from its own data</b> and <b style={{ color: "#C2570C" }}>{signed(ruler, 1)} from the ruler moving</b>.
                On the fixed ruler the whole change is its own data.
              </p>
            </div>
          )}
        </section>

        <div className="grid" style={{ marginTop: 20 }}>
          {panel("moving")}
          {panel("fixed")}
          <Card className="s12" title={`What moved ${name}'s score`} sub="Change since the start quarter, split into the country's own data and the ruler moving. Fixed rulers have no ruler part."
            actions={<Seg small label="Moving method" value={split} onChange={setSplit} options={["cur", "dyn", "mdtf"].map((m) => ({ key: m, label: D.methods[m].short }))} />}>
            <div className="legend" style={{ margin: "0 0 4px" }}><span><i style={{ background: "#3A82E4" }} />Own data</span><span><i style={{ background: "#F97316" }} />Ruler moving</span><span><i style={{ background: "#16212C", borderRadius: 6 }} />Total</span><span className="push">points on the {D.methods[split].short}'s own scale</span></div>
            <SplitBars rows={splitRows} height={250} mark={t - b - 1} format={(v) => (Math.abs(v) % 1 < 0.05 || Math.abs(v) % 1 > 0.95 ? v.toFixed(0) : v.toFixed(1))} ariaLabel={`${name}: change in ${D.methods[split].short} score split into own data and ruler movement`} />
          </Card>
        </div>
      </div>
    </>
  );
}
