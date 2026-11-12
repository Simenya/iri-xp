"""Compares the exported data with the validated results (reference/results7.json, reference/zvariants.json).

    python check_parity.py

Exits with a non-zero status if a number differs by more than its tolerance, so a wrong figure never reaches the dashboard.
"""
import json
import os
import sys

import engine as E

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "client", "public", "data")
ref = json.load(open(os.path.join(HERE, "reference", "results7.json")))["res"]
zref = json.load(open(os.path.join(HERE, "reference", "zvariants.json")))
mc = json.load(open(os.path.join(DATA, "mc.json")))
shock = json.load(open(os.path.join(DATA, "shock.json")))
scores = json.load(open(os.path.join(DATA, "scores.json")))["scores"]

bad = 0


def check(label, mine, theirs, tol):
    global bad
    ok = abs(mine - theirs) <= tol
    bad += not ok
    if not ok:
        print(f"  DIFF {label}: exported {mine:.5f} vs validated {theirs:.5f} (tolerance {tol})")


full = mc["runs"] >= 1000
for m in E.ORDER:
    r, x = ref[m], mc["methods"][m]
    check(f"{m} direction holds", x["dir"], r["mc_dir"], 1e-9 if full else 0.05)
    check(f"{m} rank band", x["band"], r["mc_band"], 1e-9 if full else 1.0)
    check(f"{m} score noise %", x["noisePct"], r["mc_noise_pct"], 1e-6 if full else 1.0)
    check(f"{m} random-shock mean largest move %", x["shock"]["meanMaxPct"], r["t1mc_mean_max_pct"], 1e-6)
    check(f"{m} random-shock mean countries moved", x["shock"]["meanMoved"], r["t1mc_mean_n"], 1e-9)
    check(f"{m} new record: rises", x["record"]["up"], r["t3mc_up"], 1e-9)
    check(f"{m} new record: falls", x["record"]["down"], r["t3mc_down"], 1e-9)
    check(f"{m} spread (SD of 2025 Q4 scores)", x["sd"], r["sd"], 1e-6)
    lt = E.ci("LT"); si = shock["sizes"].index(1.0)
    check(f"{m} Lithuania +1 SD: countries moved", shock["moved"][m][lt][si], r["t1_n"], 0)
    check(f"{m} Lithuania +1 SD: largest move", shock["maxAbs"][m][lt][si], r["t1_max"], 1e-3)
    check(f"{m} Singapore datacentres at 2x record, % of spread", mc["curve"][m]["pct"][-1], r["t3_pct"], 1e-2)
    for c, d in r["focus"].items():
        check(f"{m} 2025 Q4 score {c}", scores[m][E.qe][E.ci(c)], d["score"], 1e-3 if m != "dea" else 1e-3)
for key, name in (("none", "raw"), ("3", "cap3"), ("4", "cap4"), ("5", "cap5")):
    for a, b in (("rho", "rho"), ("meanShift", "mean"), ("gainPct", "gain"), ("dir", "dir"), ("band", "band"), ("noisePct", "noise")):
        check(f"z cap {key} {a}", mc["zcap"][key][a], zref[name][b], 1e-9 if full else (0.05 if a in ("dir",) else 1.0))
assert shock["frozenWorst"] < 1e-9
print("frozen methods moved another country by at most", shock["frozenWorst"])
print("runs:", mc["runs"], "| mismatches:", bad)
sys.exit(1 if bad else 0)
