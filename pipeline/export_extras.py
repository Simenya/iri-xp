"""Two extra datasets for the Country and What-if views.

    python export_extras.py

world.json  : a country's score and rank under every method when the REST of the world improves by 0 to 1 standard deviations
              and the country itself stands still (2025 Q4, frozen constants).
ruler.json  : for the three moving rulers whose reference values can be held still, the score each country would have had
              if the ruler of a chosen starting quarter had never moved. Real score minus this is the ruler's effect.
"""
import json
import os
import sys
import time
from multiprocessing import Pool

for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_v, "1")
import numpy as np

import engine as E

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "client", "public", "data")
WORKERS = int(os.environ.get("IRI_WORKERS", "6"))
SHIFTS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0]
BASELINES = [0, 4, 8, 12, 16, 20, 24]          # 2019 Q1 ... 2025 Q1
QUICK = "--quick" in sys.argv


def main():
    t0 = time.time()
    E.init()
    nC = E.nC
    # ---------------------------------------------------------------- ruler effect
    held = {}
    for m in ("cur", "dyn", "mdtf"):
        arr = np.stack([E.held_scores(m, b) for b in BASELINES])        # [baseline, t, c]
        real = E.score(m, E.R)
        for k, b in enumerate(BASELINES):
            assert np.abs(arr[k, b] - real[b]).max() < 1e-8, (m, b)      # held ruler equals the real ruler at its own quarter
        held[m] = np.round(arr, 2).tolist()
    json.dump(dict(baselines=BASELINES, held=held), open(os.path.join(OUT, "ruler.json"), "w"), separators=(",", ":"))
    print("ruler effect %.0fs" % (time.time() - t0), flush=True)

    # ---------------------------------------------------------------- rest-of-world scenarios
    countries = range(0, nC, 20) if QUICK else range(nC)
    tasks = [(c, s) for c in countries for s in SHIFTS]
    with Pool(WORKERS, initializer=E.init) as P:
        res, t1 = [], time.time()
        for i, r in enumerate(P.imap(E.world_case, tasks, chunksize=4), 1):
            res.append(r)
            if i % max(1, len(tasks) // 10) == 0:
                print(f"  world: {i}/{len(tasks)} ({time.time() - t1:.0f}s)", flush=True)
    score = {m: [[None] * len(SHIFTS) for _ in range(nC)] for m in E.ORDER}
    rank = {m: [[None] * len(SHIFTS) for _ in range(nC)] for m in E.ORDER}
    for c, s, out in res:
        si = SHIFTS.index(s)
        for m in E.ORDER:
            score[m][c][si] = round(out[m][0], 3); rank[m][c][si] = out[m][1]
    # fixed rulers: a country that stands still keeps exactly its score, whatever the rest of the world does
    for m in E.ORDER:
        if m in E.MOVING:
            continue
        for c in countries:
            assert max(score[m][c]) - min(score[m][c]) < 1e-2, (m, c, score[m][c])
    json.dump(dict(shifts=SHIFTS, score=score, rank=rank, spread={m: float(E._S["base"][m][1].std()) if m != "dea" else float(E._S["dea_lv"][2025].std()) for m in E.ORDER}),
              open(os.path.join(OUT, "world.json"), "w"), separators=(",", ":"))
    print("done %.0fs" % (time.time() - t0), flush=True)


if __name__ == "__main__":
    main()
