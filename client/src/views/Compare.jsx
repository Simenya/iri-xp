import React, { useMemo, useState } from "react";
import { TrendChart } from "../components/charts.jsx";
import { Card, CountryPicker, RulerBadge, Seg } from "../components/ui.jsx";
import { FROM_YEARS, baselineQuarter, series } from "../lens.js";
import { CHIP_ORDER, METHOD_COLOR, fmt } from "../util.js";

const PEER_COLORS = ["#2563EB", "#16A34A", "#DC2626", "#9333EA", "#0891B2"];
const fmtChange = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(Number.isInteger(v) ? 0 : 1)}`;

function Shift({ v }) {
  if (!v) return <span className="pchip flat">•</span>;
  return <span className={`pchip ${v > 0 ? "up" : "down"}`}>{v > 0 ? "▲" : "▼"} {Math.abs(v)}</span>;
}

export default function Compare({ D, S, set, openMethod }) {
  const [add, setAdd] = useState(0);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("All");
  const [rows, setRows] = useState(15);
  const [A, B] = S.pair;
  const peers = S.peers.map((code) => D.idx[code]).filter((i) => i != null);
  const b = baselineQuarter(S.from), t = D.latest, measure = S.cmpMeasure;
  const colorOf = (i) => PEER_COLORS[S.peers.indexOf(D.countries[i].code) % PEER_COLORS.length];

  const ser = (m, c) => series(D, m, c, b, measure);
  const all = [A, B].flatMap((m) => peers.flatMap((c) => ser(m, c))).filter(Number.isFinite);
  const domain = all.length ? [Math.min(...all), Math.max(...all)] : [0, 1];
  const fmtY = measure === "rank" ? (v) => `#${Math.round(v)}` : measure === "change" ? fmtChange : (v) => fmt(v, 0);
  const setPeers = (arr) => set({ peers: arr.slice(0, 5) });

  const panel = (m, slot) => (
    <Card className="s6 panel" key={slot}>
      <div className="cardhead" style={{ marginBottom: 6 }}>
        <div className="row wrap">
          <select className="select" value={m} aria-label={`Method for the ${slot ? "right" : "left"} chart`} onChange={(e) => set({ pair: slot ? [A, e.target.value] : [e.target.value, B] })}>
            {CHIP_ORDER.map((x) => <option key={x} value={x}>{D.methods[x].short}</option>)}
          </select>
          <RulerBadge id={m} />
        </div>
      </div>
      <TrendChart labels={D.quarters} series={peers.map((c) => ({ id: D.countries[c].code, label: D.countries[c].name, color: colorOf(c), values: ser(m, c) }))}
        yDomain={domain} invert={measure === "rank"} format={fmtY} zero={measure === "change" ? 0 : undefined} height={300} endLabels animateKey={`${m}${measure}${b}${S.peers.join()}`}
        ariaLabel={`${measure} of ${peers.map((c) => D.countries[c].name).join(", ")} under ${D.methods[m].name}`} />
    </Card>
  );

  const regions = useMemo(() => ["All", ...new Set(D.countries.map((c) => c.region))], [D]);
  const rkA = D.ranks(A, t), rkB = D.ranks(B, t);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return D.countries.map((c, i) => ({ c, i })).filter(({ c }) => (region === "All" || c.region === region) && (!s || c.name.toLowerCase().includes(s)))
      .sort((p, q) => rkA[p.i] - rkA[q.i] || p.c.name.localeCompare(q.c.name));
  }, [D, search, region, A]);

  const downloadCsv = () => {
    const text = [["Country", "Code", "Region", `${D.methods[A].short} rank`, `${D.methods[B].short} rank`, "Places gained under the right method"],
      ...list.map(({ c, i }) => [`"${c.name}"`, c.code, c.region, rkA[i], rkB[i], rkA[i] - rkB[i]])].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "iri-method-ranks.csv" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="ctl">
        <div className="chips" style={{ alignItems: "center" }}>
          {peers.map((c) => (
            <span key={c} className="mchip on" style={{ "--c": colorOf(c) }}><span className="ring" />{D.countries[c].name}
              {peers.length > 1 && <button type="button" aria-label={`Remove ${D.countries[c].name}`} className="xchip" onClick={() => setPeers(S.peers.filter((x) => x !== D.countries[c].code))}>×</button>}</span>
          ))}
          {peers.length < 5 && <CountryPicker key={add} D={D} value={peers[0]} label="" placeholder="Add a country" onChange={(i) => { setPeers([...S.peers, D.countries[i].code]); setAdd(add + 1); }} />}
        </div>
        <div className="field"><span className="lab">From</span>
          <select className="select" value={S.from} onChange={(e) => set({ from: +e.target.value })} aria-label="Start year">{FROM_YEARS.slice(0, 6).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <Seg small label="Measure" value={measure} onChange={(v) => set({ cmpMeasure: v })} options={[{ key: "rank", label: "Rank" }, { key: "change", label: "Change since start" }, { key: "score", label: "Score" }]} />
      </div>

      <div className="page">
        <div className="grid">
          {panel(A, 0)}{panel(B, 1)}
          <Card className="s12" title="Where they stand in 2025 Q4" sub="Rank under the two methods you picked above">
            <div className="tablewrap"><table>
              <thead><tr><th>Country</th><th className="c">{D.methods[A].short}</th><th className="c">{D.methods[B].short}</th><th className="c">Places gained on the right</th></tr></thead>
              <tbody>{peers.map((c) => (
                <tr key={c}><td><span className="dot" style={{ background: colorOf(c), marginRight: 8 }} /><b>{D.countries[c].name}</b></td>
                  <td className="c num"><b>#{rkA[c]}</b> <span className="cs">{fmt(D.scores[A][t][c], 1)}</span></td>
                  <td className="c num"><b>#{rkB[c]}</b> <span className="cs">{fmt(D.scores[B][t][c], 1)}</span></td>
                  <td className="c"><Shift v={rkA[c] - rkB[c]} /></td></tr>))}
              </tbody></table></div>
          </Card>
          <Card className="s12" title="All countries, 2025 Q4"
            actions={<div className="row wrap">
              <input className="select" style={{ width: 190 }} placeholder="Search countries" value={search} onChange={(e) => { setSearch(e.target.value); setRows(15); }} aria-label="Search countries" />
              <select className="select" value={region} onChange={(e) => { setRegion(e.target.value); setRows(15); }} aria-label="Region">{regions.map((r) => <option key={r}>{r}</option>)}</select>
              <button className="btn line" onClick={downloadCsv}>CSV</button></div>}>
            <div className="tablewrap"><table>
              <thead><tr><th>Country</th><th>Region</th><th className="c"><span className="dot" style={{ background: METHOD_COLOR[A], marginRight: 6 }} />{D.methods[A].short}</th><th className="c"><span className="dot" style={{ background: METHOD_COLOR[B], marginRight: 6 }} />{D.methods[B].short}</th><th className="c">Places gained</th></tr></thead>
              <tbody>{list.slice(0, rows).map(({ c, i }) => (
                <tr key={c.code} style={{ cursor: "pointer" }} onClick={() => set({ country: c.code, tab: "country" })} title="Open this country">
                  <td><b>{c.name}</b></td><td className="cs">{c.region}</td><td className="c num"><b>#{rkA[i]}</b></td><td className="c num"><b>#{rkB[i]}</b></td><td className="c"><Shift v={rkA[i] - rkB[i]} /></td></tr>))}
              </tbody></table></div>
            <div className="row between wrap" style={{ marginTop: 12 }}>
              <span className="cs">Showing {Math.min(rows, list.length)} of {list.length}</span>
              {rows < list.length ? <button className="btn line" onClick={() => setRows(rows + 30)}>Show 30 more</button> : list.length > 15 && <button className="btn line" onClick={() => setRows(15)}>Show fewer</button>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
