# Plant Lab

An interactive 3D plant-growing simulation workstation. Build a virtual growing
environment, change the conditions, run a time-based simulation, and see whether
a plant would thrive there and what to change if not.

It opens on **My plants**: a list of your plants with a predicted status for each. From there you can add a plant (from a curated library of 12 species, or by photo or description using an AI vision API with your own key), open one in the 3D lab, run a **check-up** that ranks likely causes of the symptoms you see against the conditions you entered, or ask **what will grow in this spot**.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation engine tests
npm run build      # type-check and production build
```

## How it is organised

| Path | What it holds |
| --- | --- |
| `src/sim/` | The simulation engine. Plain TypeScript, no React or Three.js. |
| `src/sim/species/` | Species profiles and registry. A plant is data: tolerances plus leaf shape and growth habit for the renderer. |
| `src/sim/diagnose.ts` | Check-up (symptoms + conditions → ranked causes) and spot ranking across species. |
| `src/ai/identify.ts` | Photo/description intake via an AI API. Prefers a curated match; generated profiles are clamped and labelled as estimates. |
| `src/sim/engine.ts` | Deterministic daily time-step model and scoring. |
| `src/sim/recommend.ts` | Recommendations (each one re-simulated and ranked), explanations, comparison rows. |
| `src/store/useLab.ts` | Zustand store: experiment config, undo/redo, selection, results, timeline, local persistence. |
| `src/scene/` | React Three Fiber scene: procedural Monstera, pot, medium, sun, grow lights, humidity mist. |
| `src/ui/` | Toolbar, object hierarchy, context-sensitive properties, results, timeline, compare. |

Data flows one way: controls edit the experiment config in the store, the engine
turns a config into day-by-day snapshots, and the viewport draws the snapshot
for the current timeline day.

## The model

A transparent rule-based model, stepped one day at a time:

- **Light** is evaluated as daily light integral (PPFD × hours), not as scene brightness. Maintenance levels follow university extension interior minimums (75 and 150 foot-candle groups); room presets follow extension distance-from-window bands.
- **Water** is a root-zone balance: capacity from pot volume and mix, losses from
  transpiration (leaf area, light, vapour-pressure deficit) and evaporation (pot material).
- **Root oxygen** depends on the air space left in the mix at its current water content.
- **Semi-hydro** uses a reservoir, capillary wicking, nutrient solution and flushing instead.
- **Nutrients and salts**, **temperature**, **humidity**, and **pot size** each feed growth and stress.
- Leaves are tracked individually: they emerge, expand, yellow, brown and drop.

It is an estimate. The thresholds are approximate horticultural ranges written
down in `src/sim/species/monstera.ts`, and the model has not been validated
against growth trials. Identical inputs always give identical results.

## Not built yet

Room mode (walls, windows, placement-dependent light), pot-height effects on
air space, non-linear substrate blending, seasons, light acclimation, a growth
log for validating predictions, pests and disease, image-to-3D reconstruction,
and a backend so the AI features do not need a user-supplied key.
