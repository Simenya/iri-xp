# IRI Methods Simulation

An interactive dashboard that shows how a country performs under ten ways of scoring the Internet Resilience Index (IRI): four **moving rulers**, which reset as other countries move, and six **fixed rulers**, which keep frozen reference values. It is built like the IRI Dashboard (React 18 and Vite, static site on Netlify) and reads the team's method validation.

## What you see

| Tab | What it does |
|---|---|
| **Country** | Pick a country, a start year and a quarter. The headline pair compares today's IRI with the recommended z-score and splits the current IRI's change into the country's **own data** and the **ruler moving**. Below, the same country's trend under the moving rulers and the fixed rulers sits side by side on one scale, with a legend table (score, rank, change, quarterly swing) and a "what moved" chart. Switch between change since the start, rank and score. |
| **What if** | Drag a slider. Either every other country improves while the country stands still, or the country improves while everyone else stands still. Each method's score and rank respond live: fixed rulers keep a still country's score, moving rulers do not. |
| **Compare** | Up to five countries on two methods side by side, with the ranks they get and a searchable table of all 180 countries. |
| **Evidence** | The validation behind the verdicts: scorecard, the four Monte Carlo questions (direction, rank wobble, others react, new records and the z-score cap) and Stress tests 1 to 4. |

Click any method name for its guide. Every view is a shareable link (the address bar records the tab, country, start year, quarter, scenario and methods).

## Run it

You need Node.js 18 or later.

```bash
npm run setup     # install the client packages
npm run dev       # open http://localhost:5174
npm test          # check the data against the validation deck
npm run build     # production build in client/dist
```

The validated data files are already in `client/public/data`, so the site runs without Python.

## Regenerate the data (optional)

Python 3.10 or later with `numpy`, `scipy` and `pandas`.

```bash
npm run data      # export_data.py, export_extras.py, then check_parity.py
```

| Script | Produces |
|---|---|
| `pipeline/export_data.py` | Scores for every method and quarter, 1,000 Monte Carlo runs, 300 random shocks, 1,000 ceiling cases, the one-country shock grid, the z-score cap variants (about 15 to 20 minutes with `IRI_WORKERS=12`). |
| `pipeline/export_extras.py` | `world.json` (a country's score and rank when the rest of the world improves) and `ruler.json` (what each moving ruler would have scored had its reference values been held at a starting quarter), about 2 minutes. |
| `pipeline/check_parity.py` | Compares the exported numbers with the validated results and fails on any difference. |
| `pipeline/engine.py` | The ten methods, Malmquist / DEA and the simulation workers. |

Numbers are protected three ways: `check_parity.py` reproduces the validated results (0 differences in 1,000 runs); `client/test/data.test.js` locks the data to the figures in the final presentation and checks the what-if and ruler-split data; and Netlify runs these tests before every build.

## Deploy on Netlify

Push the `IRI_Method_Explorer` folder to a Git repository (Base directory `IRI_Method_Explorer` if it is a sub-folder) and import it in Netlify. Settings are read from `netlify.toml`. Or run `npm run build` and drag `client/dist` onto https://app.netlify.com/drop.

## How to read the numbers

- **Change since the start** puts every method on the current IRI's scale (the same typical gap between countries), so a moving and a fixed ruler can share one chart. The legend table gives each method's own points.
- **Own data versus ruler.** For the current IRI, dynamic min-max and moving distance to frontier, the ruler part is the difference between the real score and the score the country would have had if the starting quarter's reference values had never moved. Fixed rulers have no ruler part by construction.
- **Quarterly swing** is the average quarter-to-quarter move on that common scale. Malmquist / DEA is calculated once a year, so its line steps and its swing is small.
- **What-if scenarios** act in 2025 Q4 with frozen constants, on all 27 indicators, in units of the 2019 standard deviation (1 is a typical gap between countries). Rank falls under every method when others overtake a country, which is why the score and the rank are shown separately.
- **Data period.** 2019 Q1 to 2025 Q4, as in the validation. ISOC revised some published Pulse scores in November 2026, so live figures can differ. The current IRI is the team's rebuild and matches ISOC's published scores (rank correlation 0.999 or better).
- **Tests 1 to 4** are taken from the team's reports as shown in the final deck, and cover eight methods.
- **The cap trade-off.** A cap removes the runaway gain from one extreme indicator but ties the countries beyond it: at ±3, 95 countries sit beyond the cap on some indicator and up to 28 tie at the top of IPv6; at ±5, 21 countries and at most 5.

Carnegie Mellon University Africa MSIT practicum, Fall 2026, for the Internet Society.
