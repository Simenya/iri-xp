import React, { useEffect, useMemo, useRef, useState } from "react";
import { CHIP_ORDER, GLOSSARY, METHOD_COLOR, barColor, rulerOf } from "../util.js";

export function Card({ title, sub, actions, className = "", children, id }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || actions) && (
        <div className="cardhead">
          <div className="flex1">
            {title && <h3 className="ct">{title}</h3>}
            {sub && <p className="cs">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Segmented control. options: [{key, label, sub}] */
export function Seg({ options, value, onChange, small = false, label }) {
  return (
    <div className={`seg ${small ? "small" : ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} className={o.key === value ? "on" : ""} aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}{o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/** Small "i" button that explains a term on hover or focus. */
export function Tip({ term, text }) {
  const body = text || GLOSSARY[term];
  const pop = useRef(null);
  if (!body) return null;
  // keep the pop-up inside the window, wherever the button sits
  const place = () => requestAnimationFrame(() => {
    const el = pop.current;
    if (!el) return;
    el.style.left = "-8px";
    const over = el.getBoundingClientRect().right - (window.innerWidth - 12);
    if (over > 0) el.style.left = `${-8 - over}px`;
  });
  return (
    <span className="tip" onMouseEnter={place} onFocus={place}>
      <button type="button" aria-label={`What does this mean? ${body}`}>i</button>
      <span className="pop" role="tooltip" ref={pop}>{body}</span>
    </span>
  );
}

export function RulerBadge({ id, ruler }) {
  const r = ruler || rulerOf(id);
  return <span className={`badge ${r}`}>{r === "moving" ? "Moving ruler" : "Frozen ruler"}</span>;
}

export function Verdict({ label, tone }) {
  return <span className={`verdict ${tone}`}>{label}</span>;
}

export const Dot = ({ id }) => <span className="dot" style={{ background: METHOD_COLOR[id] }} />;

/** Toggleable chips, one per method. `selected` is an array of ids. */
export function MethodChips({ D, selected, onToggle, ids = CHIP_ORDER, max }) {
  return (
    <div className="chips" role="group" aria-label="Methods to compare">
      {ids.map((id) => {
        const on = selected.includes(id);
        const locked = !on && max && selected.length >= max;
        return (
          <button key={id} type="button" className={`mchip ${on ? "on" : ""}`} aria-pressed={on} disabled={locked}
            title={locked ? `Up to ${max} methods at a time` : D.methods[id].tagline}
            style={{ "--c": METHOD_COLOR[id], ...(locked ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
            onClick={() => onToggle(id)}>
            <span className="ring" />
            {D.methods[id].short}
          </button>
        );
      })}
    </div>
  );
}

export function CountryPicker({ D, value, onChange, label = "Country", placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return D.countries.map((c, i) => ({ ...c, i })).filter((c) => !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [D, q]);
  const cur = D.countries[value];
  return (
    <div className="picker field" ref={ref}>
      <span className="lab">{label}</span>
      <div style={{ position: "relative" }}>
        <button type="button" className="pk" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setQ(""); }}>
          <span className="ellipsis" style={placeholder ? { color: "#5E6873" } : undefined}>{placeholder || cur.name}</span><span aria-hidden="true" style={{ fontSize: 10, color: "#5E6873" }}>▼</span>
        </button>
        {open && (
          <div className="menu">
            <input autoFocus placeholder="Search countries" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search countries" />
            <div className="list" role="listbox">
              {list.length === 0 && <div className="cs" style={{ padding: 14 }}>No match</div>}
              {list.map((c) => (
                <button key={c.code} role="option" aria-selected={c.i === value} className={`opt ${c.i === value ? "on" : ""}`}
                  onClick={() => { onChange(c.i); setOpen(false); }}>
                  <span>{c.name}</span><span>{c.region}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => <span key={it.label}><i style={{ background: it.color }} />{it.label}</span>)}
    </div>
  );
}

export const RULER_LEGEND = [
  { label: "Moving ruler", color: "#F97316" }, { label: "Frozen ruler", color: "#60A5FA" }, { label: "Base-year z-score", color: "#1E3A8A" },
];

export { barColor };

/** A slider that snaps to labelled stops. stops: array of label strings. */
export function StopSlider({ stops, value, onChange, label }) {
  const n = stops.length - 1;
  return (
    <div className="stops">
      <input type="range" min={0} max={n} step={1} value={value} aria-label={label} onChange={(e) => onChange(+e.target.value)} style={{ "--p": `${(value / n) * 100}%` }} />
      <div className="stoplabels" aria-hidden="true">
        {stops.map((t, i) => <button type="button" tabIndex={-1} key={i} className={i === value ? "on" : ""} style={{ left: `${(i / n) * 100}%` }} onClick={() => onChange(i)}>{t}</button>)}
      </div>
    </div>
  );
}
