"""Builds every data file the IRI Method Explorer shows, from the ISOC panel in inputs/.

    python export_data.py            # full run: 1,000 Monte Carlo runs, 900 shock cases, 1,000 ceiling cases (a few minutes)
    python export_data.py --quick    # 100 runs, for testing the pipeline only

Outputs go to ../client/public/data/. Numbers are then checked against the validated results in reference/ (see check_parity.py).
"""
import json
import os
import shutil
import sys
import time
from multiprocessing import Pool

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):   # one thread per worker: avoids oversubscribing the machine
    os.environ.setdefault(_v, "1")

import numpy as np
from scipy.stats import rankdata

import engine as E

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "client", "public", "data")
QUICK = "--quick" in sys.argv
N_MC = 100 if QUICK else 1000
N_SHOCK = 30 if QUICK else 300
N_CEIL = 100 if QUICK else 1000
SIZES = [0.25, 0.5, 1.0, 1.5, 2.0]                     # shock sizes, in 2019 standard deviations
LEVELS = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0]    # Singapore datacentres as a multiple of the 2019 to 2024 record
SEED = 2026
WORKERS = int(os.environ.get("IRI_WORKERS", "6"))


def rnd(a, d=3):
    return np.round(np.asarray(a, dtype=float), d).tolist()


def pmap(P, fn, args, label, chunk=5):
    """Pool.map with progress, so a stalled run is visible in the log."""
    out, t1 = [], time.time()
    step = max(1, len(args) // 10)
    for i, r in enumerate(P.imap(fn, args, chunksize=chunk), 1):
        out.append(r)
        if i % step == 0:
            print(f"  {label}: {i}/{len(args)} ({time.time() - t1:.0f}s)", flush=True)
    return out


def rk_desc(s):
    return np.argsort(np.argsort(-s)) + 1


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    E.init()
    S = E._S
    nC = E.nC
    methods = E.ORDER

    # ---------------------------------------------------------------- scores for the rankings view
    scores = {}
    for m in methods:
        if m == "dea":
            continue
        scores[m] = E.score(m, E.R)
    dea_years = np.stack([S["dea_lv"][y] for y in range(2019, 2026)])
    scores["dea"] = dea_years[E.QY - 2019]                       # annual levels repeated for each quarter
    sd = {m: float(S["base"][m][1].std()) if m != "dea" else float(S["dea_lv"][2025].std()) for m in methods}
    json.dump({"quarters": E.Q, "annual": ["dea"], "decimals": {"dea": 4},
               "scores": {m: rnd(scores[m], 4 if m == "dea" else 3) for m in methods}},
              open(os.path.join(OUT, "scores.json"), "w"), separators=(",", ":"))
    print("scores %.0fs" % (time.time() - t0), flush=True)

    with Pool(WORKERS, initializer=E.init) as P:
        # ---------------------------------------------------------------- Monte Carlo
        t1 = time.time()
        runs = pmap(P, E.mc_run, [(SEED, r) for r in range(N_MC)], "monte carlo")
        print("monte carlo %d runs %.0fs" % (N_MC, time.time() - t1), flush=True)
        rk = {m: np.stack([r[1][m] for r in runs]) for m in methods}
        dr = {m: np.stack([r[2][m] for r in runs]) for m in methods}
        no = {m: np.stack([r[3][m] for r in runs]) for m in methods}
        nq = {m: np.stack([r[4][m] for r in runs]) for m in methods}

        # ---------------------------------------------------------------- random shocks (the Monte Carlo independence question)
        t1 = time.time()
        shocks = pmap(P, E.random_shock, [(SEED, r) for r in range(N_SHOCK)], "random shocks", 2)
        print("random shocks %.0fs" % (time.time() - t1), flush=True)

        # ---------------------------------------------------------------- random ceiling cases (does a new record raise the score?)
        t1 = time.time()
        ceil = pmap(P, E.record_case, [(SEED, r) for r in range(N_CEIL)], "ceiling cases")
        print("ceiling cases %.0fs" % (time.time() - t1), flush=True)

        # ---------------------------------------------------------------- shock grid for the simulator: every country x five sizes
        t1 = time.time()
        grid = pmap(P, E.shock_deltas, [(c, s) for c in range(nC) for s in SIZES], "shock grid", 3)
        print("shock grid %.0fs" % (time.time() - t1), flush=True)

    # ---------------------------------------------------------------- Monte Carlo summary per method
    base_change, base_unit = {}, {}
    for m in methods:
        if m == "dea":
            base_change[m] = (S["malm0"][0] - 1) * 100; base_unit[m] = "%"
        else:
            b = S["base"][m]; base_change[m] = b[1] - b[0]; base_unit[m] = "points"
    mc = {}
    for m in methods:
        q = {p: np.percentile(rk[m], p, axis=0) for p in (5, 25, 50, 75, 95)}
        band = q[95] - q[5]
        ns = np.array([[(np.abs(np.delete(d[m], c)) > 1e-6).sum(), np.abs(np.delete(d[m], c)).max()] for c, _, d in shocks])
        cs = np.array([x[m] for x in ceil], dtype=float)
        mc[m] = dict(
            sd=sd[m], dir=float(dr[m].mean()), dirNoiseOnly=float(nq[m].mean()), band=float(band.mean()),
            noisePct=float(no[m].std(0).mean() / sd[m] * 100), rankSd=float(rk[m].std(0).mean()),
            dirP=rnd(dr[m].mean(0), 3), rank={f"p{p}": rnd(q[p], 1) for p in q}, rankBand=rnd(band, 1),
            baseChange=rnd(base_change[m], 3), baseUnit=base_unit[m],
            shock=dict(meanMoved=float(ns[:, 0].mean()), shareMoved=float((ns[:, 0] > 0).mean()),
                       meanMaxPct=float(ns[:, 1].mean() / sd[m] * 100), p95MaxPct=float(np.percentile(ns[:, 1], 95) / sd[m] * 100)),
            record=dict(up=float((cs > 1e-6).mean()), down=float((cs < -1e-6).mean()), flat=float((np.abs(cs) <= 1e-6).mean()),
                        medPct=float(np.median(cs) / sd[m] * 100)))

    # ---------------------------------------------------------------- Singapore datacentre curve, with and without a cap on the z-score
    k = E.K.index("datacenters"); sg = E.ci("SG"); rec = E.window(E.R, 2024)[k].max()
    curve = {}
    for m in methods:
        vals = []
        for L in LEVELS:
            X = E.R.copy(); X[k, E.qe, sg] = rec * L
            if m == "dea":
                lo, hi = E.pooled_const(X, 2025); Y = E.dea_year(X, lo, hi); vals.append(float(E.eff(Y[2025], Y[2025], [sg])[0] * 100))
            else:
                vals.append(float(E.score(m, X)[E.qe, sg]))
        v1 = vals[LEVELS.index(1.0)]
        curve[m] = dict(points=rnd([v - v1 for v in vals], 3), pct=rnd([(v - v1) / sd[m] * 100 for v in vals], 2))
    zcurve = {}
    for cap in (3, 4, 5):
        vals = []
        for L in LEVELS:
            X = E.R.copy(); X[k, E.qe, sg] = rec * L
            vals.append(float(E.score("z", X, cap=cap)[E.qe, sg]))
        v1 = vals[LEVELS.index(1.0)]
        zcurve[str(cap)] = dict(points=rnd([v - v1 for v in vals], 3), pct=rnd([(v - v1) / sd["z"] * 100 for v in vals], 2))

    # ---------------------------------------------------------------- z-score cap variants (rank agreement, direction, rank band, noise)
    cur = E.wsum(E.current_ind(E.R, E.FLAGS), E.W2)
    c0 = {y: E.masked_mean_sd(E.R, y) for y in (2019, 2020, 2021)}

    def zrun(cap):
        f = lambda X, y=2019, w=E.W2: 50 + 10 * E.wsum(E.z_ind(X, *c0[y], cap), w)
        Sx = f(E.R); b = Sx[[E.qp, E.qe]]; sdx = Sx[E.qe].std()
        a_, c_ = rk_desc(Sx[E.qe]), rk_desc(cur[E.qe])
        v = []
        for mlt in (1, 2):
            X = E.R[:, [E.qe]].copy(); X[k, 0, sg] = rec * mlt; v.append(f(X)[0, sg])
        rng = np.random.default_rng(SEED); dirs, ranks, ns = [], [], []
        for _ in range(N_MC):
            Nn = rng.standard_normal((E.nK, 2, nC))
            X = E.R[:, [E.qp, E.qe]] + 0.1 * E.SD19[:, None, None] * Nn
            u = rng.uniform(.8, 1.2, E.nK); w = u * E.W2 / (u * E.W2).sum(); y = int(rng.integers(2019, 2022))
            s = f(X, y, w); dirs.append((s[1] - s[0] > 0) == (b[1] - b[0] > 0)); ranks.append(rk_desc(s[1])); ns.append(f(X)[1])
        ranks = np.array(ranks); band = np.percentile(ranks, 95, 0) - np.percentile(ranks, 5, 0)
        return dict(rho=float(np.corrcoef(a_, c_)[0, 1]), meanShift=float(np.abs(a_ - c_).mean()), maxShift=int(np.abs(a_ - c_).max()),
                    gainPct=float((v[1] - v[0]) / sdx * 100), dir=float(np.mean(dirs)), band=float(band.mean()), noisePct=float(np.array(ns).std(0).mean() / sdx * 100))
    zcap = {"none": zrun(np.inf), "3": zrun(3), "4": zrun(4), "5": zrun(5)}
    print("z caps %.0fs" % (time.time() - t0), flush=True)

    json.dump(dict(runs=N_MC, noiseShare=0.10, weightSwing=0.20, seed=SEED, shockRuns=N_SHOCK, ceilingRuns=N_CEIL, methods=mc,
                   levels=LEVELS, curve=curve, zcurve=zcurve, zcap=zcap, ceilingCountry="SG", ceilingIndicator="datacenters"),
              open(os.path.join(OUT, "mc.json"), "w"), separators=(",", ":"))

    # ---------------------------------------------------------------- shock grid -> shock.json + shock.bin
    nS = len(SIZES)
    own = {m: [[0.0] * nS for _ in range(nC)] for m in methods}
    moved = {m: [[0] * nS for _ in range(nC)] for m in methods}
    maxabs = {m: [[0.0] * nS for _ in range(nC)] for m in methods}
    vec = np.zeros((len(E.MOVING), nC, nS, nC), dtype=np.int16)
    worst_frozen = 0.0
    for c, s, out in grid:
        si = SIZES.index(s)
        for m in methods:
            d = out[m].copy(); own[m][c][si] = float(d[c]); d[c] = 0.0
            moved[m][c][si] = int((np.abs(d) > 1e-6).sum()); maxabs[m][c][si] = float(np.abs(d).max())
            if m in E.MOVING:
                q = np.round(d * 1000)
                assert np.abs(q).max() < 32767, (m, c, s)
                vec[E.MOVING.index(m), c, si] = q.astype(np.int16)
            else:
                worst_frozen = max(worst_frozen, float(np.abs(d).max()))
    assert worst_frozen < 1e-9, f"a frozen method moved another country: {worst_frozen}"
    vec.astype("<i2").tofile(os.path.join(OUT, "shock.bin"))
    json.dump(dict(sizes=SIZES, movingMethods=E.MOVING, scale=1000, shape=[len(E.MOVING), nC, nS, nC],
                   own={m: [rnd(r, 3) for r in own[m]] for m in methods}, moved=moved,
                   maxAbs={m: [rnd(r, 3) for r in maxabs[m]] for m in methods}, spread={m: sd[m] for m in methods},
                   frozenWorst=worst_frozen),
              open(os.path.join(OUT, "shock.json"), "w"), separators=(",", ":"))

    # ---------------------------------------------------------------- how many countries a capped z-score would tie (2025 Q4)
    mu, sdv = E.z_const(E.R, 2019)
    zq = E.POL[:, None] * (E.R[:, E.qe] - mu[:, None]) / sdv[:, None]
    cap_ties = {}
    for cap in (3, 4, 5):
        top, bottom = (zq >= cap).sum(1), (zq <= -cap).sum(1)
        kt, kb = int(top.argmax()), int(bottom.argmax())
        side, kk, n = ("top", kt, int(top[kt])) if top[kt] >= bottom[kb] else ("bottom", kb, int(bottom[kb]))
        cap_ties[str(cap)] = dict(largestGroup=n, indicator=E.K[kk], side=side, indicatorsAffected=int(((top > 0) | (bottom > 0)).sum()),
                                  countriesAffected=int(((zq >= cap) | (zq <= -cap)).any(0).sum()))
    json.dump(cap_ties, open(os.path.join(OUT, "cap_ties.json"), "w"), indent=1)

    # ---------------------------------------------------------------- shared static files
    for name in ("methods_info.json", "report_tests.json"):
        shutil.copy(os.path.join(E.INP, name), os.path.join(OUT, name))
    shutil.copy(os.path.join(E.INP, "countries.json"), os.path.join(OUT, "countries.json"))
    print("done %.0fs" % (time.time() - t0), flush=True)


if __name__ == "__main__":
    main()
