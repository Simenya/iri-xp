import React, { useCallback, useEffect, useRef, useState } from "react";
import { loadData } from "./data.js";
import MethodDrawer from "./components/MethodDrawer.jsx";
import Country from "./views/Country.jsx";
import WhatIf from "./views/WhatIf.jsx";
import Compare from "./views/Compare.jsx";
import Evidence from "./views/Evidence.jsx";
import { ALL } from "./util.js";

const TABS = [{ key: "country" }, { key: "whatif" }, { key: "compare" }, { key: "evidence" }];
const MAIN = [{ key: "compare", label: "Performance" }, { key: "whatif", label: "What If" }];
const MORE = [{ key: "country", label: "Country" }, { key: "methods", label: "Methods" }, { key: "evidence", label: "Evidence" }];
const DEFAULTS = {
  tab: "compare", country: "KE", from: 2019, quarter: null, measure: "change", scn: "world", step: 4, wiMeasure: "change",
  peers: ["ZA", "RW", "UG", "SG"], pair: ["cur", "z"], cmpMeasure: "rank", ev: "score", mcq: "q1", tq: "test1",
};
// which keys each tab writes into the address bar: [state key, short param name]
const SHARE = {
  country: [["country", "c"], ["from", "from"], ["quarter", "q"], ["measure", "m"]],
  whatif: [["country", "c"], ["scn", "sc"], ["step", "i"], ["wiMeasure", "wm"]],
  compare: [["peers", "p"], ["pair", "pair"], ["cmpMeasure", "cm"], ["from", "from"]],
  evidence: [["ev", "ev"], ["mcq", "mq"], ["tq", "tq"], ["country", "c"]],
};
const ARRAYS = new Set(["peers", "pair"]), NUMBERS = new Set(["from", "quarter", "step"]);

function parseHash() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const p = new URLSearchParams(query), out = { ...DEFAULTS, tab: TABS.some((t) => t.key === path) ? path : DEFAULTS.tab };
  for (const [key, short] of Object.values(SHARE).flat()) {
    const v = p.get(short);
    if (v == null) continue;
    out[key] = ARRAYS.has(key) ? v.split(",").filter(Boolean) : NUMBERS.has(key) ? +v : v;
  }
  if (!out.pair.every((m) => ALL.includes(m)) || out.pair.length !== 2) out.pair = DEFAULTS.pair;
  if (out.peers.length === 0) out.peers = DEFAULTS.peers;
  return out;
}

function MoreMenu({ tab, onTab, onMethods }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const active = MORE.some((m) => m.key === tab);
  return (
    <div className="more" ref={ref}>
      <button type="button" className={active ? "on" : ""} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>More <span className="caret" aria-hidden="true">▾</span></button>
      {open && (
        <div className="menu" role="menu">
          {MORE.map((m) => (
            <button key={m.key} type="button" role="menuitem" className={tab === m.key ? "on" : ""}
              onClick={() => { setOpen(false); m.key === "methods" ? onMethods() : onTab(m.key); }}>{m.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [D, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [S, setS] = useState(parseHash);
  const [drawer, setDrawer] = useState(null);

  useEffect(() => { loadData().then(setD).catch((e) => setErr(String(e.message || e))); }, []);
  useEffect(() => {
    const on = () => setS(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // keep the address bar in step with the view, so any screen can be shared as a link
  useEffect(() => {
    if (!D) return;
    const p = new URLSearchParams();
    for (const [key, short] of SHARE[S.tab]) {
      const v = S[key];
      if (v == null || JSON.stringify(v) === JSON.stringify(DEFAULTS[key])) continue;
      p.set(short, Array.isArray(v) ? v.join(",") : String(v));
    }
    const h = `#/${S.tab}${p.toString() ? `?${p}` : ""}`;
    if (decodeURIComponent(location.hash) !== decodeURIComponent(h)) history.replaceState(null, "", h);
  }, [D, S]);

  const set = useCallback((patch) => {
    setS((s) => ({ ...s, ...patch }));
    if (patch.tab) window.scrollTo({ top: 0 });
  }, []);
  const openMethod = useCallback((id) => setDrawer(id), []);

  return (
    <>
      <header className="nav">
        <a className="logo" href="#/compare" onClick={() => set({ tab: "compare" })}>
          <span className="globe" aria-hidden="true" />
          <span className="t1">IRI Methods Simulation</span>
        </a>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {MAIN.map((t) => <button key={t.key} role="tab" aria-selected={S.tab === t.key} className={S.tab === t.key ? "on" : ""} onClick={() => set({ tab: t.key })}>{t.label}</button>)}
          <MoreMenu tab={S.tab} onTab={(k) => set({ tab: k })} onMethods={() => setDrawer("all")} />
        </nav>
      </header>

      {err && <div className="fatal">Could not load the data files: {err}. Run the data pipeline first (see the README).</div>}
      {!D && !err && <div className="loading">Loading…</div>}
      {D && S.tab === "country" && <Country D={D} S={S} set={set} openMethod={openMethod} />}
      {D && S.tab === "whatif" && <WhatIf D={D} S={S} set={set} openMethod={openMethod} />}
      {D && S.tab === "compare" && <Compare D={D} S={S} set={set} openMethod={openMethod} />}
      {D && S.tab === "evidence" && <Evidence D={D} S={S} set={set} openMethod={openMethod} />}

      {D && drawer && (
        <MethodDrawer D={D} id={drawer} onClose={() => setDrawer(null)} onPick={setDrawer}
          onCompare={(id) => { setDrawer(null); set({ tab: "compare", pair: id === "cur" ? ["cur", "z"] : ["cur", id] }); }} />
      )}

      <footer className="footer">
        ISOC Internet Resilience Index data used in the validation: 180 countries, 27 indicators, 2019 Q1 to 2025 Q4. The current IRI is the team's rebuild and matches ISOC's published scores
        (rank correlation 0.999 or better). ISOC revised some published scores in November 2026, so live Pulse figures can differ. Carnegie Mellon University Africa MSIT practicum, Fall 2026.
      </footer>
    </>
  );
}
