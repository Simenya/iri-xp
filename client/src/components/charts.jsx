import React, { useEffect, useRef, useState } from "react";
import { niceTicks } from "../util.js";

/** Width of a container, kept in sync with resizes so every chart is responsive. */
export function useWidth(initial = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(220, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Horizontal bars. rows: [{id, label, value, color, text?}] */
export function HBars({ rows, max, min = 0, format = (v) => String(v), onPick, selected = [], markAt, markLabel }) {
  const hi = max ?? Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <div className="bars" role="list">
      {rows.map((r, n) => {
        const on = selected.includes(r.id);
        const w = Math.max(0, Math.min(1, (r.value - min) / (hi - min))) * 100;
        return (
          <div key={r.id} role="listitem" className={`brow ${on ? "sel" : ""}`}>
            <div className="bl">{onPick ? <button type="button" onClick={() => onPick(r.id)}>{r.label}</button> : r.label}</div>
            <div className="track">
              <div className="fill" style={{ width: `${w}%`, background: r.color }} />
              {markAt != null && <div className="mark" style={{ left: `${((markAt - min) / (hi - min)) * 100}%` }}>{markLabel && n === 0 && <span>{markLabel}</span>}</div>}
            </div>
            <div className="val num">{r.text ?? format(r.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Bars split into parts. rows: [{id, label, parts: [{name, v, color, cls?}]}], v in 0..1 */
export function StackBars({ rows, onPick }) {
  return (
    <div className="bars" role="list">
      {rows.map((r) => (
        <div key={r.id} role="listitem" className="brow" style={{ gridTemplateColumns: "minmax(110px,190px) minmax(0,1fr)" }}>
          <div className="bl">{onPick ? <button type="button" onClick={() => onPick(r.id)}>{r.label}</button> : r.label}</div>
          <div className="stack" aria-label={r.parts.map((p) => `${p.name} ${Math.round(p.v * 100)}%`).join(", ")}>
            {r.parts.filter((p) => p.v > 0).map((p) => (
              <span key={p.name} className={p.cls} style={{ width: `${p.v * 100}%`, background: p.color }} title={`${p.name}: ${(p.v * 100).toFixed(0)}%`}>
                {p.v >= 0.07 ? `${Math.round(p.v * 100)}%` : ""}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Range plot on a shared axis. rows: [{id, label, lo, mid, hi, color, text}] */
export function RangeRows({ rows, min, max, axisLabel }) {
  const ticks = niceTicks(min, max, 6).filter((t) => t >= min && t <= max);
  const pos = (v) => ((v - min) / (max - min)) * 100;
  return (
    <div>
      {rows.map((r) => (
        <div className="rrow" key={r.id}>
          <div className="rl">{r.label}</div>
          <div className="rtrack" role="img" aria-label={`${r.label}: ${r.text}`}>
            <div className="rbar" style={{ left: `${pos(r.lo)}%`, width: `${Math.max(0.6, pos(r.hi) - pos(r.lo))}%`, background: r.color }} />
            <div className="rmed" style={{ left: `${pos(r.mid)}%` }} />
          </div>
          <div className="rtxt" dangerouslySetInnerHTML={{ __html: r.text }} />
        </div>
      ))}
      <div className="raxis"><div /><div className="ticks">{ticks.map((t) => <span key={t} style={{ left: `${pos(t)}%` }}>{t}</span>)}</div><div /></div>
      {axisLabel && <div className="cs" style={{ textAlign: "center", marginTop: 4 }}>{axisLabel}</div>}
    </div>
  );
}

function Tooltip({ x, y, width, children }) {
  const flip = x > width * 0.6;
  return <div className="tooltip" style={{ top: Math.max(0, y), [flip ? "right" : "left"]: flip ? width - x + 14 : x + 14 }}>{children}</div>;
}

/** Multi-line trend chart. series: [{id, label, color, values (null = no point), width?, dash?, endText?}].
 *  Pass the same yDomain to two charts to put them on one scale. */
export function TrendChart({ labels, series, yDomain, invert = false, height = 300, format = (v) => String(v), onPick, mark, zero, zeroLabel, xTicks, ariaLabel, animateKey, endLabels = false, tipTitle }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const L = 56, R = endLabels ? 74 : 18, T = 14, B = 30;
  const pw = Math.max(80, width - L - R), ph = height - T - B;
  const vals = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!vals.length && !yDomain) return <div ref={ref} className="chart" style={{ height }} />;
  let lo = yDomain ? yDomain[0] : Math.min(...vals), hi = yDomain ? yDomain[1] : Math.max(...vals);
  if (zero != null) { lo = Math.min(lo, zero); hi = Math.max(hi, zero); }
  const pad = (hi - lo) * 0.06 || 1;
  let ticks = niceTicks(lo - pad, hi + pad, 5);
  if (invert) ticks = ticks.filter((v) => v >= 1);
  const ymin = invert ? Math.min(ticks[0], Math.max(1, lo - pad)) : ticks[0], ymax = ticks.at(-1);
  const X = (i) => L + (labels.length > 1 ? (i * pw) / (labels.length - 1) : pw / 2);
  const Y = (v) => (invert ? T + ((v - ymin) / (ymax - ymin)) * ph : T + ph - ((v - ymin) / (ymax - ymin)) * ph);
  const yearIdx = labels.map((l, i) => (l.endsWith("Q1") ? i : -1)).filter((i) => i >= 0);
  const every = width < 520 ? 2 : 1;
  const xt = xTicks || yearIdx.filter((_, k) => k % every === 0).map((i) => ({ i, text: labels[i].slice(0, 4) }));
  const idxAt = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - L) / pw) * (labels.length - 1));
    return i >= 0 && i < labels.length ? i : null;
  };
  const path = (s) => {
    let d = "", pen = false;
    s.values.forEach((v, i) => { if (Number.isFinite(v)) { d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; } else pen = false; });
    return d;
  };
  const tip = hover != null ? series.filter((s) => Number.isFinite(s.values[hover])).map((s) => ({ s, v: s.values[hover] })).sort((a, b) => (invert ? a.v - b.v : b.v - a.v)) : [];
  const ends = endLabels ? series.map((s) => {
    const k = s.values.length - 1 - [...s.values].reverse().findIndex((v) => Number.isFinite(v));
    return Number.isFinite(s.values[k]) ? { id: s.id, y: Y(s.values[k]), t: s.endText ?? format(s.values[k]), c: s.color } : null;
  }).filter(Boolean).sort((a, b) => a.y - b.y) : [];
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  return (
    <div ref={ref} className="chart" role="img" aria-label={ariaLabel}>
      <svg width={width} height={height} onMouseMove={(e) => setHover(idxAt(e))} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const i = idxAt(e); if (i != null && onPick) onPick(i); }} style={{ cursor: onPick ? "pointer" : "default" }}>
        {ticks.map((v) => (
          <g key={v}><line x1={L} x2={L + pw} y1={Y(v)} y2={Y(v)} className="gridline" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="axis">{format(v)}</text></g>
        ))}
        {zero != null && <g><line x1={L} x2={L + pw} y1={Y(zero)} y2={Y(zero)} stroke="#8B95A0" strokeDasharray="4 3" />{zeroLabel && <text x={L + 4} y={Y(zero) - 5} className="axis">{zeroLabel}</text>}</g>}
        {xt.map((t) => <text key={t.i} x={X(t.i)} y={height - 9} textAnchor="middle" className="axis">{t.text}</text>)}
        {mark != null && <line x1={X(mark)} x2={X(mark)} y1={T} y2={T + ph} stroke="#23366E" strokeDasharray="3 3" opacity=".55" />}
        {series.map((s) => (
          <path key={`${animateKey}-${s.id}`} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width || 2.4} strokeDasharray={s.dash}
            strokeLinejoin="round" strokeLinecap="round" pathLength={s.dash ? undefined : 1} className={s.dash ? undefined : "draw"} />
        ))}
        {ends.map((e) => <text key={e.id} x={L + pw + 8} y={e.y + 4} className="axis" style={{ fontWeight: 700, fill: e.c }}>{e.t}</text>)}
        {hover != null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={T} y2={T + ph} stroke="#16212C" opacity=".22" />
            {tip.map(({ s, v }) => <circle key={s.id} cx={X(hover)} cy={Y(v)} r="4.4" fill="#fff" stroke={s.color} strokeWidth="2.4" />)}
          </g>
        )}
      </svg>
      {hover != null && (
        <Tooltip x={X(hover)} y={T} width={width}>
          <div className="th">{tipTitle ? tipTitle(hover) : labels[hover]}</div>
          {tip.map(({ s, v }) => <div className="tr" key={s.id}><span className="dot" style={{ background: s.color }} /><span>{s.label}</span><span className="num">{format(v)}</span></div>)}
        </Tooltip>
      )}
    </div>
  );
}

/** Diverging stacked bars: each bar is split into two parts around zero. rows: [{label, tick?, a, b}] */
export function SplitBars({ rows, height = 240, format = (v) => v.toFixed(1), colors = ["#3A82E4", "#F97316"], names = ["Own data", "Ruler"], ariaLabel, mark }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const L = 50, R = 12, T = 12, B = 30;
  const pw = Math.max(80, width - L - R), ph = height - T - B;
  const extent = Math.max(0.5, ...rows.map((r) => Math.max(Math.abs(r.a) + Math.abs(r.b), Math.abs(r.a + r.b))));
  const ticks = niceTicks(-extent * 1.05, extent * 1.05, 4);
  const lo = ticks[0], hi = ticks.at(-1);
  const Y = (v) => T + ph - ((v - lo) / (hi - lo)) * ph;
  const slot = pw / Math.max(1, rows.length), bw = Math.max(3, slot * 0.68), X = (i) => L + (i + 0.5) * slot;
  return (
    <div ref={ref} className="chart" role="img" aria-label={ariaLabel}>
      <svg width={width} height={height} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={L + pw} y1={Y(v)} y2={Y(v)} className="gridline" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="axis">{v > 0 ? `+${format(v)}` : v < 0 ? `−${format(-v)}` : "0"}</text></g>)}
        <line x1={L} x2={L + pw} y1={Y(0)} y2={Y(0)} stroke="#16212C" strokeWidth="1.2" />
        {rows.map((r, i) => {
          let pos = 0, neg = 0;
          return (
            <g key={r.label} onMouseEnter={() => setHover(i)}>
              <rect x={X(i) - slot / 2} y={T} width={slot} height={ph} fill="transparent" />
              {[[r.a, colors[0]], [r.b, colors[1]]].map(([v, c], k) => {
                const y0 = v >= 0 ? pos : neg; if (v >= 0) pos += v; else neg += v;
                return <rect key={k} x={X(i) - bw / 2} y={Math.min(Y(y0), Y(y0 + v))} width={bw} height={Math.max(0.5, Math.abs(Y(y0 + v) - Y(y0)))} fill={c} rx="1.5" opacity={hover === i || hover == null ? 1 : 0.55} />;
              })}
              <circle cx={X(i)} cy={Y(r.a + r.b)} r="2.6" fill="#16212C" />
              {r.tick && <text x={X(i)} y={height - 9} textAnchor="middle" className="axis">{r.tick}</text>}
            </g>
          );
        })}
        {mark != null && <line x1={X(mark)} x2={X(mark)} y1={T} y2={T + ph} stroke="#23366E" strokeDasharray="3 3" opacity=".5" />}
      </svg>
      {hover != null && (
        <Tooltip x={X(hover)} y={T} width={width}>
          <div className="th">{rows[hover].label}</div>
          <div className="tr"><span className="dot" style={{ background: colors[0] }} /><span>{names[0]}</span><span className="num">{format(rows[hover].a)}</span></div>
          <div className="tr"><span className="dot" style={{ background: colors[1] }} /><span>{names[1]}</span><span className="num">{format(rows[hover].b)}</span></div>
          <div className="tr"><span className="dot" style={{ background: "#16212C" }} /><span>Total</span><span className="num">{format(rows[hover].a + rows[hover].b)}</span></div>
        </Tooltip>
      )}
    </div>
  );
}

export function Sparkline({ values, color, width = 110, height = 32 }) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  let lo = Math.min(...v), hi = Math.max(...v);
  const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad;
  const pts = []; const n = values.length;
  values.forEach((x, i) => { if (Number.isFinite(x)) pts.push(`${(3 + (i * (width - 8)) / (n - 1)).toFixed(1)},${(height - 3 - ((x - lo) / (hi - lo)) * (height - 6)).toFixed(1)}`); });
  const last = pts.at(-1).split(",");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}
