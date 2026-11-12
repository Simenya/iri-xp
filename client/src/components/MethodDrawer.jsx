import React, { useEffect } from "react";
import { RulerBadge, Verdict } from "./ui.jsx";
import { CHIP_ORDER, METHOD_COLOR, fmt, pct } from "../util.js";

/** Side panel explaining one method (or, with id = "all", listing every method). */
export default function MethodDrawer({ D, id, onClose, onPick, onCompare }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  if (id === "all") {
    return (
      <>
        <div className="scrim" onClick={onClose} />
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="The ten methods">
          <button className="xbtn" aria-label="Close" onClick={onClose}>×</button>
          <div className="eyebrow">Method guide</div>
          <h2>The ten methods</h2>
          <p className="cs">Orange are moving rulers, blue are frozen. Pick one to read how it works.</p>
          <div className="guide" style={{ marginTop: 16 }}>
            {CHIP_ORDER.map((m) => (
              <button key={m} className="guiderow" onClick={() => onPick(m)}>
                <span className="dot" style={{ background: METHOD_COLOR[m] }} />
                <div className="flex1"><b>{D.methods[m].name}</b><div className="cs">{D.methods[m].tagline}</div></div>
                <span className={`verdict ${D.methods[m].tone}`}>{D.methods[m].verdict}</span>
              </button>
            ))}
          </div>
        </aside>
      </>
    );
  }

  const m = D.methods[id], mc = D.mc.methods[id];
  const t = D.tests;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={m.name}>
        <button className="xbtn" aria-label="Close" onClick={onClose}>×</button>
        <div className="row wrap"><RulerBadge ruler={m.ruler} /><Verdict label={m.verdict} tone={m.tone} /></div>
        <h2 style={{ borderLeft: `6px solid ${METHOD_COLOR[id]}`, paddingLeft: 12 }}>{m.name}</h2>
        <p className="lede">{m.tagline}</p>

        <h4>How it works</h4>
        <p>{m.how}</p>
        <div className="formula" style={{ marginTop: 10 }}>{m.formula}</div>
        {m.usedBy && <p className="cs" style={{ marginTop: 8 }}>{m.usedBy}.</p>}

        <h4>Best used for</h4>
        <p>{m.use}</p>

        <h4>Strengths</h4>
        <ul>{m.pros.map((p) => <li key={p}>{p}</li>)}</ul>
        <h4>Weaknesses</h4>
        <ul>{m.cons.map((p) => <li key={p}>{p}</li>)}</ul>

        <h4>Results in the validation</h4>
        <dl className="kv">
          <dt>Direction holds under noise</dt><dd className="num">{pct(mc.dir)}</dd>
          <dt>90% rank band</dt><dd className="num">{fmt(mc.band)} places</dd>
          <dt>Score noise</dt><dd className="num">{fmt(mc.noisePct)}% of spread</dd>
          <dt>Largest move in another country, random shocks</dt><dd className="num">{mc.shock.meanMaxPct < 0.05 ? "none" : `${fmt(mc.shock.meanMaxPct, 0)}% of spread`}</dd>
          <dt>Credits a new record</dt><dd className="num">{pct(mc.record.up)}</dd>
          {id in t.test1.broad && <><dt>Test 1: untouched countries moved</dt><dd className="num">{t.test1.broad[id] === 0 && t.test1.leader[id] === 0 ? "not at all" : `${fmt(Math.max(t.test1.broad[id], t.test1.leader[id]), 2)} typical gaps`}</dd></>}
          {id in t.test2.corr && <><dt>Test 2: rank match with published IRI</dt><dd className="num">{fmt(t.test2.corr[id], 3)}</dd></>}
        </dl>

        <div className="row wrap" style={{ marginTop: 22 }}>
          <button className="btn solid" onClick={() => onCompare(id)}>{id === "cur" ? "Compare with the z-score" : "Compare with the current IRI"}</button>
        </div>
      </aside>
    </>
  );
}
