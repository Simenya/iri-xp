import React, { useMemo, useState } from "react";
import { HBars, RangeRows, StackBars, TrendChart } from "../components/charts.jsx";
import { Card, CountryPicker, Legend, MethodChips, RULER_LEGEND, Seg, Tip, Verdict } from "../components/ui.jsx";
import { ALL, CHIP_ORDER, METHOD_COLOR, SCORECARD_ORDER, barColor, fmt, pct } from "../util.js";

const RESULT = { works: { label: "Works", color: "#7CC38A" }, catch: { label: "Works, with a catch", color: "#F0C45A" }, fails: { label: "Does not work", color: "#E07A72" } };
const RESULT_LEGEND = Object.values(RESULT).map((r) => ({ label: r.label, color: r.color }));

function Chg({ v, unit }) {
  if (v == null) return null;
  return <span className={`pchip ${v >= 0 ? "up" : "down"}`}>{v >= 0 ? "▲" : "▼"} {fmt(Math.abs(v), 1)}{unit === "%" ? "%" : " pts"}</span>;
}

function Sorter({ k, sort, setSort, children, className, tip }) {
  const on = sort.key === k;
  return (
    <th className={className} aria-sort={on ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
      <button type="button" className={on ? "on" : ""} onClick={() => setSort({ key: k, dir: on ? -sort.dir : (k === "name" || k === "verdict" ? 1 : -1) })}>
        {children}<span aria-hidden="true">{on ? (sort.dir > 0 ? "▲" : "▼") : ""}</span>
      </button>{tip}
    </th>
  );
}

// ------------------------------------------------------------------ scorecard
function Scorecard({ D, openMethod }) {
  const [more, setMore] = useState(false);
  const [sort, setSort] = useState({ key: "verdict", dir: 1 });
  const mc = D.mc.methods, t = D.tests;
  const rows = useMemo(() => SCORECARD_ORDER.map((id, order) => ({
    id, order, name: D.methods[id].name, dir: mc[id].dir, band: mc[id].band, record: mc[id].record.up,
    independent: id in t.test1.broad ? (t.test1.broad[id] === 0 && t.test1.leader[id] === 0) : null,
    corr: t.test2.corr[id] ?? null, moved: t.test3.moved[id] ?? null, ties: t.test4.ties[id] ?? null,
  })), [D]);
  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const val = (r) => (key === "verdict" ? r.order : key === "name" ? r.name : key === "independent" ? (r.independent == null ? -1 : r.independent ? 1 : 0) : r[key] ?? (dir > 0 ? Infinity : -Infinity));
    return [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : a.order - b.order) * dir);
  }, [rows, sort]);
  return (
    <Card title="All ten methods side by side" sub="Click a column to sort, a method for its guide."
      actions={<Seg small label="Detail" value={more ? "more" : "core"} onChange={(v) => setMore(v === "more")} options={[{ key: "core", label: "Core" }, { key: "more", label: "Add Tests 3 and 4" }]} />}>
      <div className="tablewrap"><table>
        <thead><tr>
          <Sorter k="name" sort={sort} setSort={setSort}>Method</Sorter>
          <Sorter k="dir" sort={sort} setSort={setSort} tip={<Tip term="direction" />}>Direction holds</Sorter>
          <Sorter k="band" sort={sort} setSort={setSort} className="c" tip={<Tip term="band" />}>Rank band</Sorter>
          <Sorter k="independent" sort={sort} setSort={setSort} className="c" tip={<Tip text="Do untouched countries keep exactly the same score when other countries' data change and the method's reference values are rebuilt?" />}>Independent, Test 1</Sorter>
          <Sorter k="corr" sort={sort} setSort={setSort} className="c" tip={<Tip term="rankcorr" />}>Rank match, Test 2</Sorter>
          <Sorter k="record" sort={sort} setSort={setSort} className="c" tip={<Tip text="Share of 1,000 random cases in which beating the best value ever recorded raised the score." />}>Credits a new record</Sorter>
          {more && <Sorter k="moved" sort={sort} setSort={setSort} className="c" tip={<Tip text="Of 18 corrections to one country's past data, how many also moved other countries' scores." />}>Test 3: moved others</Sorter>}
          {more && <Sorter k="ties" sort={sort} setSort={setSort} className="c" tip={<Tip term="tie" />}>Test 4: largest tie</Sorter>}
          <Sorter k="verdict" sort={sort} setSort={setSort} className="c">Verdict</Sorter>
        </tr></thead>
        <tbody>{sorted.map((r) => {
          const info = D.methods[r.id];
          return (
            <tr key={r.id} className={r.id === "z" ? "hl" : ""}>
              <td><button type="button" className="mname" onClick={() => openMethod(r.id)}><span className="dot" style={{ background: barColor(r.id) }} />{info.name}</button></td>
              <td style={{ minWidth: 150 }}><span className="mini"><span className="t"><i style={{ width: `${r.dir * 100}%`, background: barColor(r.id) }} /></span><b className="num">{pct(r.dir)}</b></span></td>
              <td className="c num">{fmt(r.band)}</td>
              <td className="c">{r.independent == null ? <span className="na">–</span> : r.independent ? <span className="yes">Yes</span> : <span className="no">No</span>}</td>
              <td className="c num">{r.corr == null ? <span className="na">–</span> : fmt(r.corr, 3)}</td>
              <td className="c num">{pct(r.record)}</td>
              {more && <td className="c num">{r.moved == null ? <span className="na">–</span> : r.moved === 0 ? <span className="yes">none</span> : `${r.moved} of ${t.test3.of}`}</td>}
              {more && <td className="c num">{r.ties == null ? <span className="na">–</span> : r.ties === 0 ? <span className="yes">none</span> : r.ties}</td>}
              <td className="c"><Verdict label={info.verdict} tone={info.tone} /></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <p className="cs" style={{ marginTop: 10 }}>A dash means the method was not part of that test. Frozen methods stay independent only while their constants are never recomputed.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ Monte Carlo
function MonteCarlo({ D, S, set, openMethod }) {
  const q = S.mcq, mc = D.mc.methods;
  const c = D.idx[S.country] ?? D.idx.KE, cName = D.countries[c].name;
  const [metric, setMetric] = useState("band");
  const [fragile, setFragile] = useState("cur");
  const [cap, setCap] = useState("none");
  const [cmp, setCmp] = useState(["cur", "fg"]);
  const picker = <CountryPicker D={D} value={c} onChange={(i) => set({ country: D.countries[i].code })} />;
  const sorted = (f, asc) => ALL.map((id) => ({ id, label: D.methods[id].short, value: f(id), color: barColor(id) })).sort((a, b) => (asc ? a.value - b.value : b.value - a.value));

  if (q === "q1") {
    const frag = D.countries.map((_, i) => ({ i, p: mc[fragile].dirP[i], ch: mc[fragile].baseChange[i] })).sort((a, b) => a.p - b.p).slice(0, 5);
    return (
      <div className="grid">
        <Card className="s7" title="Does a little noise change the direction?" sub="Share of 1,000 runs in which a country's 2024 to 2025 direction held. The axis starts at 50%, a coin toss.">
          <Legend items={RULER_LEGEND} />
          <HBars rows={sorted((id) => mc[id].dir)} max={1} min={0.5} format={(v) => pct(v)} onPick={openMethod} />
          <div className="tiles" style={{ marginTop: 14 }}>
            <div className="tile frozen"><div className="tv num">{pct(mc.z.dir)}</div><div className="tl">base-year z-score</div></div>
            <div className="tile moving"><div className="tv num">{pct(mc.cur.dir)}</div><div className="tl">current IRI: about 1 in 5 directions reverses</div></div>
          </div>
        </Card>
        <Card className="s5" title={cName} sub="How often its direction held" actions={picker}>
          <div style={{ display: "grid", gap: 6 }}>
            {CHIP_ORDER.map((id) => (
              <div key={id} className="row" style={{ gap: 8 }}>
                <span className="dot" style={{ background: METHOD_COLOR[id] }} />
                <button className="mname" style={{ width: 138, flex: "none", fontSize: 12.5 }} onClick={() => openMethod(id)}>{D.methods[id].short}</button>
                <span style={{ width: 96, flex: "none" }}><Chg v={mc[id].baseChange[c]} unit={mc[id].baseUnit} /></span>
                <span className="mini"><span className="t"><i style={{ width: `${mc[id].dirP[c] * 100}%`, background: barColor(id) }} /></span><b className="num" style={{ width: 38, textAlign: "right" }}>{pct(mc[id].dirP[c])}</b></span>
              </div>
            ))}
          </div>
          <h4 className="eyebrow" style={{ margin: "16px 0 6px" }}>Most fragile under
            <select className="select" style={{ marginLeft: 8, height: 30 }} aria-label="Method" value={fragile} onChange={(e) => setFragile(e.target.value)}>{CHIP_ORDER.map((m) => <option key={m} value={m}>{D.methods[m].short}</option>)}</select></h4>
          {frag.map((f) => <button key={f.i} className="mover" onClick={() => set({ country: D.countries[f.i].code })} style={{ gridTemplateColumns: "1fr auto auto" }}><span className="ellipsis">{D.countries[f.i].name}</span><Chg v={f.ch} unit={mc[fragile].baseUnit} /><b className="num">{pct(f.p)}</b></button>)}
        </Card>
      </div>
    );
  }
  if (q === "q2") {
    const ranges = CHIP_ORDER.map((id) => ({ id, lo: mc[id].rank.p5[c], mid: mc[id].rank.p50[c], hi: mc[id].rank.p95[c] }));
    const axMin = Math.max(1, Math.floor(Math.min(...ranges.map((r) => r.lo)) - 4)), axMax = Math.min(180, Math.ceil(Math.max(...ranges.map((r) => r.hi)) + 4));
    return (
      <div className="grid">
        <Card className="s6" title="How much does a country's rank wobble?" sub={metric === "band" ? "Average width of the range a rank spans in 90% of runs, in places." : "Score movement from the noise alone, as a share of the typical gap between countries."}
          actions={<Seg small label="Metric" value={metric} onChange={setMetric} options={[{ key: "band", label: "Rank band" }, { key: "noise", label: "Score noise" }]} />}>
          <Legend items={RULER_LEGEND} />
          <HBars rows={sorted((id) => (metric === "band" ? mc[id].band : mc[id].noisePct), true)} max={Math.max(...ALL.map((id) => (metric === "band" ? mc[id].band : mc[id].noisePct))) * 1.05}
            format={(v) => (metric === "band" ? fmt(v) : `${fmt(v)}%`)} onPick={openMethod} />
        </Card>
        <Card className="s6" title={cName} sub="Where its 2025 Q4 rank landed across 1,000 runs (bar: 90% of runs, tick: median)" actions={picker}>
          <RangeRows min={axMin} max={axMax} axisLabel="Rank (1 = best)" rows={ranges.map((r) => ({ id: r.id, label: D.methods[r.id].short, lo: r.lo, mid: r.mid, hi: r.hi, color: barColor(r.id), text: `<b>#${Math.round(r.mid)}</b> (${Math.round(r.lo)} to ${Math.round(r.hi)})` }))} />
        </Card>
      </div>
    );
  }
  if (q === "q3") {
    return (
      <div className="grid">
        <Card className="s7" title="Do other countries react when one country changes?" sub="300 random shocks: one country improves, the largest move anywhere else is shown as a share of the score spread.">
          <Legend items={RULER_LEGEND} />
          <HBars rows={sorted((id) => mc[id].shock.meanMaxPct)} max={Math.max(...ALL.map((id) => mc[id].shock.meanMaxPct)) * 1.08} format={(v) => `${fmt(v, 0)}%`} onPick={openMethod} />
        </Card>
        <Card className="s5" title="In one line">
          <div className="tiles" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="tile moving"><div className="tv num">{fmt(mc.cur.shock.meanMoved, 0)}</div><div className="tl">of 179 other countries move, current IRI</div></div>
            <div className="tile frozen"><div className="tv num">0</div><div className="tl">move under any frozen ruler</div></div>
          </div>
          <button className="btn solid" style={{ marginTop: 16 }} onClick={() => set({ tab: "whatif", scn: "own", step: 3 })}>Try it on the What-if page</button>
        </Card>
      </div>
    );
  }
  // q4
  const Z = D.mc.zcap, labels = D.mc.levels.map((l) => `${l}×`), zc = cap === "none" ? null : D.mc.zcurve[cap];
  const series = [
    ...(cap !== "none" ? [{ id: "z-un", label: "Z-score, no cap", color: "#9FB2DD", dash: "6 4", width: 2, values: D.mc.curve.z.pct }] : []),
    { id: "z", label: cap === "none" ? "Z-score, no cap" : `Z-score, cap ±${cap}`, color: "#1E3A8A", width: 3.4, values: (zc || D.mc.curve.z).pct },
    ...cmp.filter((m) => m !== "z").map((m) => ({ id: m, label: D.methods[m].short, color: METHOD_COLOR[m], values: D.mc.curve[m].pct })),
  ];
  const cur = Z[cap], raw = Z.none, ties = cap === "none" ? null : D.capTies[cap];
  const delta = (a, b, d) => { const x = a - b; return Math.abs(x) < 0.5 * 10 ** -d ? null : <span className={`delta ${x > 0 ? "up" : "down"}`}>{x > 0 ? "+" : "−"}{Math.abs(x).toFixed(d)}</span>; };
  return (
    <div className="grid">
      <Card className="s6" title="When a country beats its best value ever, does its score go up?" sub="1,000 random cases past the 2019 to 2024 record.">
        <Legend items={[{ label: "Score rises", color: "#046536" }, { label: "No change", color: "#C9CDD1" }, { label: "Score falls", color: "#C22F2F" }]} />
        <StackBars rows={ALL.map((id) => ({ id, label: D.methods[id].short, parts: [{ name: "Score rises", v: mc[id].record.up, color: "#046536" }, { name: "No change", v: mc[id].record.flat, color: "#C9CDD1", cls: "grey" }, { name: "Score falls", v: mc[id].record.down, color: "#C22F2F" }] })).sort((a, b) => b.parts[0].v - a.parts[0].v)} onPick={openMethod} />
      </Card>
      <Card className="s6" title="Why the z-score needs a cap" sub="Singapore's data-centre value at 0.8 to 2 times the record: its score gain as a share of the score spread.">
        <div className="row wrap" style={{ marginBottom: 8 }}><span className="cs">Cap</span>
          <Seg small label="Cap" value={cap} onChange={setCap} options={[{ key: "none", label: "None" }, { key: "3", label: "±3" }, { key: "4", label: "±4" }, { key: "5", label: "±5" }]} /><Tip term="cap" /></div>
        <TrendChart labels={labels} series={series} height={250} zero={0} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)}%`} xTicks={labels.map((l, i) => ({ i, text: l }))} animateKey={cap}
          ariaLabel="Singapore's score gain as its data-centre value rises, with and without a cap" />
        <div className="row wrap" style={{ marginTop: 4 }}><span className="cs">Compare</span><MethodChips D={D} selected={cmp} ids={CHIP_ORDER.filter((m) => m !== "z")} onToggle={(id) => setCmp(cmp.includes(id) ? cmp.filter((x) => x !== id) : [...cmp, id].slice(-4))} /></div>
      </Card>
      <Card className="s12" title={cap === "none" ? "Z-score without a cap" : `Z-score with a ±${cap} cap`}>
        <div className="tiles">
          <div className="tile frozen"><div className="tv num">{fmt(cur.gainPct, 0)}%{cap !== "none" && delta(cur.gainPct, raw.gainPct, 0)}</div><div className="tl">gain from one indicator at twice the record</div></div>
          <div className="tile"><div className="tv num">{pct(cur.dir, 1)}{cap !== "none" && delta(cur.dir * 100, raw.dir * 100, 1)}</div><div className="tl">of runs keep the direction</div></div>
          <div className="tile"><div className="tv num">{fmt(cur.band)}{cap !== "none" && delta(cur.band, raw.band, 1)}</div><div className="tl">places: rank band</div></div>
          <div className="tile"><div className="tv num">{fmt(cur.rho, 3)}{cap !== "none" && delta(cur.rho, raw.rho, 3)}</div><div className="tl">rank match with current IRI</div></div>
          <div className="tile"><div className="tv num">{ties ? ties.largestGroup : 0}</div><div className="tl">{ties ? `countries tied at the cap on ${ties.indicator.replace(/_/g, " ")}; ${ties.countriesAffected} countries beyond it` : "countries tied (no cap)"}</div></div>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Tests 1 to 4
function Tests({ D, S, openMethod }) {
  const view = S.tq, T = D.tests, t = T[view], ids = T.order, name = (id) => D.methods[id].short;
  const [t2, setT2] = useState("corr");
  let chart;
  if (view === "test1") {
    const rows = ids.slice().sort((a, b) => Math.max(T.test1.broad[b], T.test1.leader[b]) - Math.max(T.test1.broad[a], T.test1.leader[a]));
    chart = (<><Legend items={[{ label: t.labels.broad, color: "#60A5FA" }, { label: t.labels.leader, color: "#F97316" }]} />
      <div className="bars">{rows.map((id) => (
        <div key={id} style={{ display: "grid", gap: 3 }}>
          {[["broad", "#60A5FA"], ["leader", "#F97316"]].map(([k, col], n) => (
            <div key={k} className="brow" style={{ minHeight: 18 }}>
              <div className="bl">{n === 0 ? <button type="button" onClick={() => openMethod(id)}>{name(id)}</button> : null}</div>
              <div className="track" style={{ height: 14 }}><div className="fill" style={{ width: `${(t[k][id] / 0.6) * 100}%`, background: col }} /></div>
              <div className="val num" style={{ fontSize: 12 }}>{fmt(t[k][id], 3)}</div>
            </div>))}
        </div>))}</div></>);
  } else if (view === "test2") {
    const key = t2 === "corr" ? "corr" : "bigMovers";
    const rows = ids.slice().sort((a, b) => (t2 === "corr" ? t.corr[b] - t.corr[a] : t.bigMovers[a] - t.bigMovers[b])).map((id) => ({ id, label: name(id), value: t[key][id], color: barColor(id) }));
    chart = (<><div className="row between wrap" style={{ marginBottom: 6 }}><Legend items={RULER_LEGEND} />
      <Seg small label="Measure" value={t2} onChange={setT2} options={[{ key: "corr", label: "Rank correlation" }, { key: "movers", label: "Countries moving over 10 places" }]} /></div>
      {t2 === "corr" ? <HBars rows={rows} min={0.9} max={1} format={(v) => fmt(v, 3)} onPick={openMethod} markAt={t.passMark} markLabel="0.90 pass mark" /> : <HBars rows={rows} min={0} max={100} format={(v) => String(v)} onPick={openMethod} />}</>);
  } else if (view === "test3") {
    const rows = ids.slice().sort((a, b) => t.moved[a] - t.moved[b]);
    chart = (<><Legend items={RESULT_LEGEND} /><div className="row cs" style={{ justifyContent: "flex-end" }}>New quarter rewrites earlier scores?</div>
      <div className="bars">{rows.map((id) => (
        <div key={id} className="brow" style={{ gridTemplateColumns: "minmax(110px,190px) minmax(0,1fr) 150px" }}>
          <div className="bl"><button type="button" onClick={() => openMethod(id)}>{name(id)}</button></div>
          <div className="track"><div className="fill" style={{ width: `${(t.moved[id] / t.of) * 100}%`, background: RESULT[t.result[id]].color }} /></div>
          <div className="val num" style={{ display: "flex", gap: 12 }}><span style={{ width: 40 }}>{t.moved[id] === 0 ? "none" : t.moved[id]}</span><span className={t.rewrites[id] ? "no" : "mut"}>{t.rewrites[id] ? "Yes, every score" : "No"}</span></div>
        </div>))}</div><p className="cs" style={{ marginTop: 6 }}>Bars: corrections that moved other countries' scores, out of {t.of}.</p></>);
  } else {
    const rows = ids.slice().sort((a, b) => t.ties[b] - t.ties[a]);
    chart = (<><Legend items={RESULT_LEGEND} /><div className="bars">{rows.map((id) => (
      <div key={id} className="brow" style={{ gridTemplateColumns: "minmax(110px,190px) minmax(0,1fr) 210px" }}>
        <div className="bl"><button type="button" onClick={() => openMethod(id)}>{name(id)}</button></div>
        <div className="track"><div className="fill" style={{ width: `${(t.ties[id] / 36) * 100}%`, background: RESULT[t.result[id]].color }} /></div>
        <div className="val" style={{ display: "flex", gap: 10, fontWeight: 500 }}><b className="num" style={{ width: 34 }}>{t.ties[id] === 0 ? "none" : t.ties[id]}</b><span className="cs" style={{ lineHeight: 1.2 }}>{t.where[id]}</span></div>
      </div>))}</div></>);
  }
  return (
    <Card title={t.title} sub={t.question}
      actions={<Seg small label="Test" value={view} onChange={(v) => D && S.set({ tq: v })} options={["test1", "test2", "test3", "test4"].map((k, i) => ({ key: k, label: `Test ${i + 1}` }))} />}>
      {chart}
      <p className="cs" style={{ marginTop: 12 }}><b>{t.takeaway}</b></p>
    </Card>
  );
}

export default function Evidence({ D, S, set, openMethod }) {
  const sec = S.ev;
  return (
    <>
      <div className="ctl">
        <Seg label="Section" value={sec} onChange={(v) => set({ ev: v })} options={[{ key: "score", label: "Scorecard" }, { key: "mc", label: "Monte Carlo" }, { key: "tests", label: "Stress tests" }]} />
        {sec === "mc" && <Seg small label="Question" value={S.mcq} onChange={(v) => set({ mcq: v })}
          options={[{ key: "q1", label: "Direction" }, { key: "q2", label: "Rank wobble" }, { key: "q3", label: "Others react" }, { key: "q4", label: "New records and the cap" }]} />}
        {sec === "mc" && <span className="cs">1,000 runs per method · noise {Math.round(D.mc.noiseShare * 100)}% of a typical gap · weights ±{Math.round(D.mc.weightSwing * 100)}%</span>}
      </div>
      <div className="page">
        {sec === "score" && <Scorecard D={D} openMethod={openMethod} />}
        {sec === "mc" && <MonteCarlo D={D} S={S} set={set} openMethod={openMethod} />}
        {sec === "tests" && <Tests D={D} S={{ ...S, set }} openMethod={openMethod} />}
      </div>
    </>
  );
}
