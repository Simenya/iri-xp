"""Scoring methods and simulation workers behind the IRI Method Explorer.

A standalone, documented version of the validation code used for the method validation reports. It reads the
ISOC panel in `inputs/` (27 indicators x 28 quarters, 2019 Q1 to 2025 Q4, x 180 countries) and implements the ten
approaches compared in the validation. Arrays follow one convention: X[k, t, c] = indicator k, quarter t, country c.

Moving rulers recompute their reference values from the data being scored (current IRI, dynamic min-max, moving
distance to frontier, Malmquist / DEA). Frozen rulers read constants from the reference panel R and never update them.
"""
import json
import os

import numpy as np
from scipy.optimize import linprog
from scipy.stats import rankdata

HERE = os.path.dirname(os.path.abspath(__file__))
INP = os.path.join(HERE, "inputs")

# ------------------------------------------------------------------ data
_meta = json.load(open(os.path.join(INP, "meta.json"), encoding="utf-8"))
C, Q, K = _meta["countries"], _meta["quarters"], _meta["indicators"]
COUNTRIES = json.load(open(os.path.join(INP, "countries.json"), encoding="utf-8"))
NEG = set(_meta["negative"])
# Weights implied by ISOC's published scores: market concentration 0.05 and affordability 0.0375.
W = np.array([_meta["weights"][k] for k in K])
W[K.index("affordability")], W[K.index("market_concentration")] = 0.0375, 0.05
W2 = W.copy()
POL = np.array([-1.0 if k in NEG else 1.0 for k in K])          # +1 higher is better, -1 lower is better
QY = np.array([int(q[:4]) for q in Q])
PILLAR = [_meta["pillar"][k] for k in K]
PN = list(dict.fromkeys(PILLAR))
PIDX = [[i for i, p in enumerate(PILLAR) if p == n] for n in PN]


def _six(v):
    return float(np.format_float_positional(float(v), precision=6, unique=False, fractional=False, trim="-"))


R = np.vectorize(_six)(np.load(os.path.join(INP, "cube.npz"))["raw"])   # data exactly as given to the validation
nK, nQ, nC = R.shape
FLAGS = np.load(os.path.join(INP, "clip_flags.npy"))     # outlier clipping read per indicator-quarter from ISOC's published scores
ci = C.index
qe, qp = Q.index("2025 Q4"), Q.index("2024 Q4")
Q8 = [i for i, q in enumerate(Q) if q[:4] in ("2024", "2025")]

NAMES = {"cur": "Current IRI", "dyn": "Dynamic min-max", "mdtf": "Moving distance to frontier", "dea": "Malmquist / DEA",
         "pool": "Pooled min-max", "z": "Base-year z-score", "dtf": "Distance to frontier", "fg": "Fixed goalposts",
         "dtt": "Distance to target", "ampi": "AMPI"}
ORDER = list(NAMES)
MOVING = ["cur", "dyn", "mdtf", "dea"]


def sh(a, X):
    return a.reshape((-1,) + (1,) * (X.ndim - 1))


def wsum(ind, w=W2):
    return np.tensordot(w, ind, axes=1)


def masked_mean_sd(X, yr):
    m = X[:, QY == yr].reshape(nK, -1)
    return m.mean(1), m.std(1)


SD19 = masked_mean_sd(R, 2019)[1]

# ------------------------------------------------------------------ fixed goalposts: natural bounds, else the 2019 to 2024 record plus 10% headroom
_NATURAL = {"network_coverage": (0, 100), "spectrum_allocation": (0, 100), "ipv6": (0, 100), "https": (0, 100),
            "dnssec_validation": (0, 100), "dnssec": (0, 1), "manrs": (0, 100), "global_cybersecurity_index": (0, 100),
            "peering_efficiency": (0, 100), "egdi": (0, 100), "market_concentration": (10000, 0), "as_hegemony": (10000, 0)}
GP_W, GP_B, GP_T = [], [], []
for _k, _name in enumerate(K):
    _mx = R[_k, QY <= 2024].max()
    if _name in _NATURAL:
        _w, _b = _NATURAL[_name]; _t = "natural"
    elif POL[_k] > 0:
        _w, _b = 0.0, float(np.format_float_positional(1.1 * _mx, precision=8, unique=False, fractional=False, trim="-")); _t = "data"
    else:
        _w, _b = float(np.format_float_positional(1.1 * _mx, precision=8, unique=False, fractional=False, trim="-")), 0.0; _t = "data"
    GP_W.append(_w); GP_B.append(_b); GP_T.append(_t)
GP_W, GP_B, GP_T = np.array(GP_W), np.array(GP_B), np.array(GP_T)


# ------------------------------------------------------------------ normalisation per method (X[k, t, c], countries on the last axis)
def current_ind(X, fl):
    """Current IRI: each quarter, clip at Q1 - 1.5 IQR and Q3 + 1.5 IQR where ISOC's scores clip, then scale 1 to 100 between that quarter's lowest and highest country."""
    q1 = np.percentile(X, 25, axis=-1, keepdims=True); q3 = np.percentile(X, 75, axis=-1, keepdims=True); i = q3 - q1
    x = np.where(fl[..., None], np.clip(X, q1 - 1.5 * i, q3 + 1.5 * i), X)
    lo, hi = x.min(-1, keepdims=True), x.max(-1, keepdims=True)
    pos = np.where(hi > lo, (x - lo) / np.where(hi > lo, hi - lo, 1), 0.5)
    return 1 + 99 * np.where(sh(POL, X) < 0, 1 - pos, pos)


def dynamic_ind(X):
    """Dynamic min-max: per quarter, no outlier treatment, 0 to 100."""
    lo, hi = X.min(-1, keepdims=True), X.max(-1, keepdims=True)
    pos = np.where(hi > lo, (X - lo) / np.where(hi > lo, hi - lo, 1), 0.5)
    return 100 * np.where(sh(POL, X) < 0, 1 - pos, pos)


def window(X, end=2024, start=2019):
    return X[:, (QY >= start) & (QY <= end)].reshape(nK, -1)


def pooled_const(X, end=2024):
    w = window(X, end)
    return w.min(1), w.max(1)


def pooled_ind(X, lo, hi):
    pos = (X - sh(lo, X)) / sh(hi - lo, X)
    return 100 * np.where(sh(POL, X) < 0, 1 - pos, pos)


def dtf_const(X, end=2024, trim=5.0):
    """Distance to frontier: best = the record in the window; worst = the trimmed 5th percentile."""
    w = window(X, end)
    best = np.where(POL > 0, w.max(1), w.min(1))
    worst = np.where(POL > 0, np.percentile(w, trim, axis=1), np.percentile(w, 100 - trim, axis=1))
    return worst, best


def dtf_ind(X, worst, best, cap=100.0):
    return np.clip(100 * (X - sh(worst, X)) / sh(best - worst, X), 100 - cap, cap)


def moving_dtf_ind(X, worst):
    """Moving distance to frontier: the floor stays fixed, the frontier (100) resets to each quarter's best country."""
    best = np.where(sh(POL, X) > 0, X.max(-1, keepdims=True), X.min(-1, keepdims=True))
    return np.clip(100 * (X - sh(worst, X)) / (best - sh(worst, X)), 0, 100)


def z_const(X, yr=2019):
    return masked_mean_sd(X, yr)


def z_ind(X, mu, sd, cap=np.inf):
    """Base-year z-score: how many 2019 standard deviations a value sits from the 2019 average, flipped where lower is better, optionally capped."""
    return np.clip(sh(POL, X) * (X - sh(mu, X)) / sh(sd, X), -cap, cap)


def ampi_delta(X, endyr):
    m = X[:, QY <= endyr].reshape(nK, -1)
    return (m.max(1) - m.min(1)) / 2


def ampi_ind(X, ref, delta):
    return 100 + sh(POL, X) * 60 * (X - sh(ref, X)) / (2 * sh(delta, X))


def ampi_score(r):
    M = r.mean(0); S = np.sqrt(((r - M) ** 2).mean(0))
    return M - S ** 2 / M


def fg_ind(X, worst, best, cap=100.0):
    return np.clip(100 * (X - sh(worst, X)) / sh(best - worst, X), 100 - cap, cap)


def dtt_const(X, end=2025):
    w = window(X, end)
    flo = np.where(POL > 0, w.min(1), w.max(1))
    tgt = np.where(POL > 0, np.percentile(w, 90, axis=1), np.percentile(w, 10, axis=1))
    return flo, tgt + 0.5 * (tgt - flo)


def score(m, X, tq=None, ref=None, w=W2, **o):
    """Overall score of every country. `tq` lists the quarter indices X covers (needed for the current IRI's outlier flags).
    Frozen constants come from the reference panel `ref` (default R) and stay fixed unless a caller passes new ones."""
    ref = R if ref is None else ref
    if m == "cur":
        fl = FLAGS if tq is None else FLAGS[:, tq]
        return wsum(current_ind(X, fl), w)
    if m == "dyn":
        return wsum(dynamic_ind(X), w)
    if m == "pool":
        lo, hi = o.get("c") or pooled_const(ref, o.get("end", 2024)); return wsum(pooled_ind(X, lo, hi), w)
    if m == "z":
        mu, sd = o.get("c") or z_const(ref, o.get("yr", 2019))
        return 50 + 10 * wsum(z_ind(X, mu, sd, o.get("cap", np.inf)), w)
    if m == "dtf":
        wr, be = o.get("c") or dtf_const(ref, o.get("end", 2024), o.get("trim", 5.0)); return wsum(dtf_ind(X, wr, be), w)
    if m == "mdtf":
        wr, _ = o.get("c") or dtf_const(ref, o.get("end", 2024), o.get("trim", 5.0)); return wsum(moving_dtf_ind(X, wr), w)
    if m == "fg":
        return wsum(fg_ind(X, o.get("wst", GP_W), o.get("bst", GP_B)), w)
    if m == "dtt":
        fl, tg = o.get("c") or dtt_const(ref, o.get("end", 2025)); return wsum(np.clip(100 * (X - sh(fl, X)) / sh(tg - fl, X), 0, 100), w)
    if m == "ampi":
        rf = o.get("rf"); d = o.get("delta")
        rf = z_const(ref, o.get("yr", 2019))[0] if rf is None else rf
        d = ampi_delta(ref, o.get("end", 2024)) if d is None else d
        return ampi_score(ampi_ind(X, rf, d))
    raise ValueError(m)


# ------------------------------------------------------------------ Malmquist / DEA (benefit of the doubt on the four IRI pillars, unit input)
def pillars(X, lo, hi, w=W2):
    """X[k, t, c] on pooled goalposts -> [pillar, t, c] in 0 to 1."""
    ind = pooled_ind(X, lo, hi) / 100
    out = []
    for ids in PIDX:
        wp = w[ids] / w[ids].sum(); out.append(np.tensordot(wp, ind[ids], axes=1))
    return np.stack(out)


def pareto(Y):
    """Keep only countries not dominated on every pillar: dominated rows can never bind in the LP."""
    Y = np.maximum(Y, 1e-9)
    order = np.argsort(-Y.sum(0)); keep = []
    for j in order:
        v = Y[:, j]
        if not any(np.all(Y[:, i] >= v - 1e-12) for i in keep):
            keep.append(j)
    return Y[:, keep]


def _lp(y, F):
    r = linprog(-np.maximum(y, 1e-9), A_ub=F.T, b_ub=np.ones(F.shape[1]), bounds=(0, None), method="highs")
    return -r.fun


def eff(Y0, Yref, which=None):
    """Efficiency of each column of Y0 against the frontier of Yref (can exceed 1 across periods)."""
    F = pareto(Yref)
    ids = range(Y0.shape[1]) if which is None else which
    return np.array([_lp(Y0[:, j], F) for j in ids])


def dea_year(X, lo, hi, w=W2):
    P = pillars(X, lo, hi, w)
    return {y: np.maximum(P[:, QY[:P.shape[1]] == y].mean(1), 0) if P.shape[1] == nQ else None for y in range(2019, 2026)}


def malm(a, b):
    """Malmquist productivity index and the later period's efficiency level (x100) from two yearly pillar matrices."""
    Fa, Fb = pareto(a), pareto(b)
    n = a.shape[1]; v = np.zeros((4, n))
    for j in range(n):
        for i, (y, F) in enumerate(((b[:, j], Fa), (a[:, j], Fa), (b[:, j], Fb), (a[:, j], Fb))):
            v[i, j] = _lp(y, F)
    return np.sqrt(v[0] / v[1] * v[2] / v[3]), v[2] * 100


# ------------------------------------------------------------------ shared state for workers
_S = {}


def init():
    _S["pc"] = {e: pooled_const(R, e) for e in (2023, 2024, 2025)}
    _S["dc"] = {(e, t): dtf_const(R, e, t) for e in (2023, 2024, 2025) for t in (2.5, 5.0, 10.0)}
    _S["zc"] = {y: z_const(R, y) for y in (2019, 2020, 2021)}
    _S["dt"] = dtt_const(R)
    _S["delta"] = ampi_delta(R, 2024)
    lo, hi = _S["pc"][2025]
    Y = dea_year(R, lo, hi)
    _S["Y"] = Y
    _S["malm0"] = malm(Y[2024], Y[2025])
    _S["dea_lv"] = {y: eff(Y[y], Y[y]) * 100 for y in range(2019, 2026)}
    _S["base"] = {m: score(m, R)[[qp, qe]] for m in ORDER if m != "dea"}


def mc_run(a):
    """One Monte Carlo run: 10% noise on the 2024 and 2025 data, weights varied by up to 20%, and each method's own settings varied."""
    seed, run = a
    rng = np.random.default_rng([seed, run])
    N8 = rng.standard_normal((nK, 8, nC))
    u = rng.uniform(0.8, 1.2, nK); w = u * W2 / (u * W2).sum()
    yr = int(rng.integers(2019, 2022)); end = int(rng.integers(2023, 2026)); trim = float(rng.choice([2.5, 5.0, 10.0]))
    gu = rng.uniform(0.9, 1.1, nK); _fy = int(rng.integers(2018, 2021)); tu = rng.uniform(0.9, 1.1, nK)   # _fy kept so the random stream matches the validation
    noise8 = 0.1 * SD19[:, None, None] * N8
    Xn2 = R[:, [qp, qe]] + noise8[:, [3, 7]]
    fl, tg = _S["dt"]; tg2 = fl + (tg - fl) * tu
    bst = np.where((GP_T == "data") & (POL > 0), GP_B * gu, GP_B); wst = np.where((GP_T == "data") & (POL < 0), GP_W * gu, GP_W)
    tq = [qp, qe]
    full = {"cur": score("cur", Xn2, tq=tq, w=w), "dyn": score("dyn", Xn2, w=w), "pool": score("pool", Xn2, w=w, c=_S["pc"][end]),
            "z": score("z", Xn2, w=w, c=_S["zc"][yr]), "dtf": score("dtf", Xn2, w=w, c=_S["dc"][(end, trim)]),
            "mdtf": score("mdtf", Xn2, w=w, c=_S["dc"][(end, trim)]), "fg": score("fg", Xn2, w=w, wst=wst, bst=bst),
            "dtt": score("dtt", Xn2, w=w, c=(fl, tg2)), "ampi": score("ampi", Xn2, w=w, rf=_S["zc"][yr][0], delta=_S["delta"])}
    only = {"cur": score("cur", Xn2, tq=tq), "dyn": score("dyn", Xn2), "pool": score("pool", Xn2, c=_S["pc"][2024]),
            "z": score("z", Xn2, c=_S["zc"][2019]), "dtf": score("dtf", Xn2, c=_S["dc"][(2024, 5.0)]),
            "mdtf": score("mdtf", Xn2, c=_S["dc"][(2024, 5.0)]), "fg": score("fg", Xn2), "dtt": score("dtt", Xn2, c=_S["dt"]),
            "ampi": score("ampi", Xn2, rf=_S["zc"][2019][0], delta=_S["delta"])}
    rk, dr, no, noq = {}, {}, {}, {}
    for m in full:
        s = full[m]; rk[m] = np.argsort(np.argsort(-s[1])) + 1
        b = _S["base"][m]; dr[m] = (s[1] - s[0] > 0) == (b[1] - b[0] > 0)
        no[m] = only[m][1]; noq[m] = (only[m][1] - only[m][0] > 0) == (b[1] - b[0] > 0)
    # DEA: yearly means of the noisy quarters on the four pillars
    X8 = R[:, Q8] + noise8

    def yr_pillars(lo, hi, ww):
        ind = pooled_ind(X8, lo, hi) / 100
        P = np.maximum(np.stack([np.tensordot(ww[ids] / ww[ids].sum(), ind[ids], axes=1) for ids in PIDX]), 0)
        return P[:, :4].mean(1), P[:, 4:].mean(1)

    lo, hi = _S["pc"][end]; a_, b_ = yr_pillars(lo, hi, w)
    mal, lvl = malm(a_, b_)
    rk["dea"] = rankdata(-lvl, "min").astype(int)
    m0, _ = _S["malm0"]; dr["dea"] = (mal > 1) == (m0 > 1)
    lo, hi = _S["pc"][2025]; a2, b2 = yr_pillars(lo, hi, W2)
    F = pareto(b2); no["dea"] = np.array([_lp(b2[:, j], F) for j in range(nC)]) * 100
    mal2, _ = malm(a2, b2); noq["dea"] = (mal2 > 1) == (m0 > 1)
    return run, {m: rk[m].astype(np.int16) for m in rk}, {m: dr[m] for m in dr}, {m: no[m].astype(np.float32) for m in no}, {m: noq[m] for m in noq}


def random_shock(a):
    """Random shock: a random country improves by a random size (0.25 to 2 standard deviations) in 2025 Q4, frozen constants kept."""
    seed, run = a
    rng = np.random.default_rng([seed, 100000 + run])
    c = int(rng.integers(nC)); size = float(rng.uniform(0.25, 2.0))
    return shock_deltas((c, size))


def shock_deltas(a):
    """Score change of every country when country c improves by `size` 2019 standard deviations on all 27 indicators in 2025 Q4.
    Returns (c, size, {method: delta vector of length nC}); constants of frozen rulers are NOT recalculated."""
    c, size = a
    X = R.copy(); X[:, qe, c] += POL * size * SD19
    out = {}
    for m in ORDER:
        if m == "dea":
            continue
        out[m] = score(m, X[:, [qe]], tq=[qe])[0] - _S["base"][m][1]
    lo, hi = _S["pc"][2025]
    lo2, hi2 = pooled_const(X, 2025)
    Y1 = dea_year(X, lo2, hi2)[2025]
    out["dea"] = eff(Y1, Y1) * 100 - _S["dea_lv"][2025]
    return c, size, out


def record_case(a):
    """Random ceiling case: a random country's random indicator is pushed past the 2019 to 2024 record by a random margin."""
    seed, run = a
    rng = np.random.default_rng([seed, 200000 + run])
    c = int(rng.integers(nC)); k = int(rng.integers(nK)); L = float(rng.uniform(1.2, 2.0))
    w19 = window(R, 2024)[k]; rec = w19.max() if POL[k] > 0 else w19.min(); rg = w19.max() - w19.min()
    X1, X2 = R[:, [qe]].copy(), R[:, [qe]].copy()
    X1[k, 0, c] = rec; X2[k, 0, c] = rec + POL[k] * (L - 1) * rg
    out = {}
    for m in ORDER:
        if m == "dea":
            continue
        out[m] = float(score(m, X2, tq=[qe])[0, c] - score(m, X1, tq=[qe])[0, c])
    Xa, Xb = R.copy(), R.copy(); Xa[k, qe, c] = rec; Xb[k, qe, c] = rec + POL[k] * (L - 1) * rg
    la, ha = pooled_const(Xa, 2025); lb, hb = pooled_const(Xb, 2025)
    Ya, Yb = dea_year(Xa, la, ha)[2025], dea_year(Xb, lb, hb)[2025]
    out["dea"] = float((eff(Yb, Yb, [c])[0] - eff(Ya, Ya, [c])[0]) * 100)
    return out


def world_case(a):
    """Rest-of-world scenario: every country except c improves by `s` 2019 standard deviations on all 27 indicators in 2025 Q4,
    while c stays exactly as it was. Frozen constants are kept. Returns (c, s, {method: (c's score, c's rank)})."""
    c, s = a
    out = {}
    Xq = R[:, [qe]] + (POL * s * SD19)[:, None, None]
    Xq[:, 0, c] = R[:, qe, c]
    for m in ORDER:
        if m == "dea":
            continue
        v = score(m, Xq, tq=[qe])[0]
        out[m] = (float(v[c]), int(1 + (v > v[c] + 1e-9).sum()))
    X = R.copy(); X[:, qe, :] += (POL * s * SD19)[:, None]
    X[:, qe, c] = R[:, qe, c]
    lo2, hi2 = pooled_const(X, 2025)
    Y = dea_year(X, lo2, hi2)[2025]
    e = eff(Y, Y) * 100
    out["dea"] = (float(e[c]), int(1 + (e > e[c] + 1e-6).sum()))
    return c, s, out


def held_scores(m, b):
    """Scores of every country and quarter if the ruler of quarter b were never reset (moving rulers only).
    held[t, c] = what the score would be on quarter b's reference values. At t = b it equals the real score."""
    xb = R[:, b, :]
    if m == "cur":
        fl = FLAGS[:, b]
        q1 = np.percentile(xb, 25, axis=-1); q3 = np.percentile(xb, 75, axis=-1); i = q3 - q1
        a, z = (q1 - 1.5 * i)[:, None], (q3 + 1.5 * i)[:, None]
        xbc = np.where(fl[:, None], np.clip(xb, a, z), xb)
        lo, hi = xbc.min(-1), xbc.max(-1)
        x = np.where(fl[:, None, None], np.clip(R, a[:, :, None], z[:, :, None]), R)
        den = np.where(hi > lo, hi - lo, 1)
        pos = np.where((hi > lo)[:, None, None], (x - lo[:, None, None]) / den[:, None, None], 0.5)
        return wsum(1 + 99 * np.where(POL[:, None, None] < 0, 1 - pos, pos))
    if m == "dyn":
        lo, hi = xb.min(-1), xb.max(-1)
        den = np.where(hi > lo, hi - lo, 1)
        pos = np.where((hi > lo)[:, None, None], (R - lo[:, None, None]) / den[:, None, None], 0.5)
        return wsum(100 * np.where(POL[:, None, None] < 0, 1 - pos, pos))
    if m == "mdtf":
        worst, _ = dtf_const(R, 2024, 5.0)
        best = np.where(POL > 0, xb.max(-1), xb.min(-1))
        return wsum(np.clip(100 * (R - worst[:, None, None]) / (best - worst)[:, None, None], 0, 100))
    raise ValueError(m)
