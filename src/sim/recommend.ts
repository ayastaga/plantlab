/**
 * Recommendations and explanations, derived from simulation output.
 *
 * Each candidate adjustment is a concrete config patch. Every candidate is
 * re-simulated over the same duration and ranked by the score change it
 * actually produces, so the list reflects this experiment rather than generic
 * care advice.
 */
import { applyPatch } from './defaults'
import { FACTOR_LABELS, derive, runSimulation } from './engine'
import { dli } from './light'
import { MEDIUM_PRESETS, matchPreset } from './media'
import { dimsForVolume, potDrains } from './pots'
import type {
  DeepPartial,
  ExperimentConfig,
  FactorKey,
  Recommendation,
  SimulationResult,
  StressKey,
} from './types'

type Patch = DeepPartial<ExperimentConfig>
interface Candidate {
  id: string
  factor: FactorKey
  title: string
  detail: string
  patch: Patch
}

const stressMean = (r: SimulationResult, k: StressKey) => r.stresses.find((s) => s.key === k)?.mean ?? 0
const round = (x: number, step: number) => Math.round(x / step) * step

function candidates(config: ExperimentConfig, result: SimulationResult): Candidate[] {
  const d = derive(config)
  const sp = d.species
  const out: Candidate[] = []
  const targetDli = (sp.light.dliOptLow + sp.light.dliOptHigh) / 2

  /* light */
  if (d.totalDli < sp.light.dliOptLow) {
    const hours = Math.max(config.light.hoursPerDay, 10)
    const ppfd = round((sp.light.dliOptLow * 1.25 * 1e6) / (hours * 3600), 10)
    out.push({
      id: 'light-brighter-spot',
      factor: 'light',
      title: 'Move to a brighter position',
      detail: `Raise canopy light to about ${ppfd} µmol·m⁻²·s⁻¹ for ${hours} h (DLI ≈ ${dli(ppfd, hours).toFixed(1)}), e.g. within a metre of a bright window with filtered light.`,
      patch: { light: { ppfd, hoursPerDay: hours, exposure: 'indirect' } },
    })
    const need = Math.max(2, targetDli - d.totalDli)
    const glPpfd = round(clamp((need * 1e6) / (12 * 3600), 60, 400), 10)
    out.push({
      id: 'light-grow-light',
      factor: 'light',
      title: 'Add a grow light',
      detail: `Supplement with a grow light delivering about ${glPpfd} µmol·m⁻²·s⁻¹ at the canopy for 12 h a day (+${dli(glPpfd, 12).toFixed(1)} DLI).`,
      patch: {
        light: {
          growLights: [
            ...config.light.growLights,
            {
              id: `gl-rec-${config.light.growLights.length}`,
              name: `Grow light ${config.light.growLights.length + 1}`,
              enabled: true,
              ppfd: glPpfd,
              hoursPerDay: 12,
              colorK: 4000,
            },
          ],
        },
      },
    })
  }
  if (stressMean(result, 'scorch') > 0.02) {
    out.push({
      id: 'light-filter',
      factor: 'light',
      title: 'Filter the direct sun',
      detail: 'Diffuse the light with a sheer curtain or pull the plant back from the glass so it receives bright indirect light (about 300 µmol·m⁻²·s⁻¹).',
      patch: { light: { exposure: 'indirect', ppfd: Math.min(config.light.ppfd, 300), hoursPerDay: Math.max(config.light.hoursPerDay, 9) } },
    })
  }
  if (d.totalDli > sp.light.dliOptHigh * 1.2 && config.light.exposure === 'indirect') {
    const ppfd = round((targetDli * 1e6) / (config.light.hoursPerDay * 3600), 10)
    out.push({
      id: 'light-reduce',
      factor: 'light',
      title: 'Reduce light slightly',
      detail: `Light is above the useful range. About ${ppfd} µmol·m⁻²·s⁻¹ is plenty.`,
      patch: { light: { ppfd } },
    })
  }

  /* water */
  if (!d.semiHydro) {
    const interval = result.derived.suggestedIntervalDays
    const amount = result.derived.suggestedAmountMl
    if (interval !== config.watering.intervalDays || Math.abs(amount - config.watering.amountMl) > 60) {
      const wetter = stressMean(result, 'waterlogging') > stressMean(result, 'drought')
      out.push({
        id: 'water-schedule',
        factor: 'water',
        title: wetter ? 'Water less often' : 'Match watering to how fast the pot dries',
        detail: `In this pot and mix the plant uses about ${Math.round(result.derived.meanWaterUseMl)} ml a day. Water roughly every ${interval} days with about ${amount} ml, letting the mix dry partway in between.`,
        patch: { watering: { intervalDays: interval, amountMl: amount, method: 'top' } },
      })
    }
    if (!potDrains(config.pot)) {
      out.push({
        id: 'water-drainage',
        factor: 'water',
        title: 'Use a pot with drainage holes',
        detail: 'Without drainage, excess water pools at the bottom and starves roots of oxygen.',
        patch: { pot: { drainageHoles: true } },
      })
    }
    if (config.watering.method === 'bottom' && !d.drains) {
      out.push({
        id: 'water-top',
        factor: 'water',
        title: 'Switch to top watering',
        detail: 'Bottom watering cannot reach the roots in a pot without drainage holes.',
        patch: { watering: { method: 'top' } },
      })
    }
  } else {
    const sh = config.medium.semiHydro
    if (sh.reservoirPct > 35 || sh.reservoirPct < 15) {
      out.push({
        id: 'hydro-reservoir',
        factor: 'water',
        title: 'Set the reservoir to about a quarter of the pot',
        detail: 'A reservoir around 25 % of pot height keeps most roots in moist air rather than standing water.',
        patch: { medium: { semiHydro: { reservoirPct: 25 } } },
      })
    }
    if (stressMean(result, 'drought') > 0.03) {
      out.push({
        id: 'hydro-topup',
        factor: 'water',
        title: 'Top up the reservoir more often',
        detail: 'The reservoir runs dry between top-ups, and LECA holds very little water on its own.',
        patch: { watering: { intervalDays: Math.max(2, Math.round(config.watering.intervalDays / 2)) } },
      })
    }
  }

  /* humidity */
  const effectiveRh = config.humidity.humidifier
    ? Math.max(config.humidity.ambientRh, config.humidity.targetRh)
    : config.humidity.ambientRh
  if (effectiveRh < sp.humidity.optLowRh) {
    const target = Math.round(sp.humidity.optLowRh + 5)
    out.push({
      id: 'humidity-humidifier',
      factor: 'humidity',
      title: `Run a humidifier to ${target} %`,
      detail: `Air at ${Math.round(effectiveRh)} % RH is drier than this species prefers (${sp.humidity.optLowRh}–${sp.humidity.optHighRh} %).`,
      patch: { humidity: { humidifier: true, targetRh: target } },
    })
  }

  /* temperature */
  const t = config.temperature
  const tp = sp.temperature
  if (t.meanC < tp.optLowC || t.minC < tp.growthMinC + 2) {
    const meanC = Math.max(t.meanC, tp.optLowC + 2)
    const minC = Math.max(t.minC, tp.growthMinC + 4)
    out.push({
      id: 'temp-warmer',
      factor: 'temperature',
      title: 'Keep it warmer',
      detail: `Aim for about ${meanC} °C with nights no colder than ${minC} °C. Move away from cold glass and draughts.`,
      patch: { temperature: { meanC, minC, maxC: Math.max(t.maxC, meanC + 2) } },
    })
  }
  if (t.meanC > tp.optHighC || t.maxC > tp.heatStressC) {
    const meanC = Math.min(t.meanC, tp.optHighC - 3)
    const maxC = Math.min(t.maxC, tp.heatStressC - 3)
    out.push({
      id: 'temp-cooler',
      factor: 'temperature',
      title: 'Keep it cooler',
      detail: `Aim for about ${meanC} °C with daytime peaks under ${maxC} °C. Add shade or airflow.`,
      patch: { temperature: { meanC, maxC, minC: Math.min(t.minC, meanC - 2) } },
    })
  }

  /* medium & nutrients */
  if (!d.semiHydro) {
    const aroid = MEDIUM_PRESETS.find((p) => p.id === 'aroid')!
    if (d.airPorosity < sp.medium.airPorosityOpt - 0.04 && matchPreset(config.medium.mix, false)?.id !== 'aroid') {
      out.push({
        id: 'medium-aroid',
        factor: 'medium',
        title: 'Repot into a chunky aroid mix',
        detail: `The current mix holds about ${Math.round(d.airPorosity * 100)} % air when wet. Blending in perlite and bark (${aroid.note}) keeps roots oxygenated.`,
        patch: { medium: { mix: { ...aroid.mix } } },
      })
    }
    if (d.waterHolding < 0.17) {
      out.push({
        id: 'medium-retentive',
        factor: 'medium',
        title: 'Add a water-retentive component',
        detail: 'This mix holds very little water without a reservoir. Add potting soil or coir, or switch it to semi-hydro.',
        patch: { medium: { mix: { ...aroid.mix } } },
      })
    }
    if (stressMean(result, 'nutrientDeficiency') > 0.03 || config.watering.feedIntervalDays === 0) {
      out.push({
        id: 'feed-regular',
        factor: 'medium',
        title: 'Fertilise every two weeks at half strength',
        detail: 'Nutrients in the mix run down as the plant grows. A regular diluted feed keeps new leaves coming.',
        patch: { watering: { feedIntervalDays: 14, feedStrengthPct: 50 } },
      })
    }
    if (stressMean(result, 'saltBuildup') > 0.03) {
      out.push({
        id: 'feed-less',
        factor: 'medium',
        title: 'Feed less and flush the pot',
        detail: 'Fertiliser salts are accumulating. Halve the feed and water through until it drains.',
        patch: {
          watering: {
            feedStrengthPct: Math.max(25, Math.round(config.watering.feedStrengthPct / 2)),
            feedIntervalDays: Math.max(config.watering.feedIntervalDays, 21),
            method: 'top',
          },
          pot: { drainageHoles: true },
        },
      })
    }
  } else {
    const sh = config.medium.semiHydro
    if (d.capillarySaturation > 0.25) {
      out.push({
        id: 'hydro-inert',
        factor: 'medium',
        title: 'Use an inert medium for semi-hydro',
        detail: 'Soil, coir and bark stay saturated above a reservoir and rot. Use LECA or pumice instead.',
        patch: { medium: { mix: { ...MEDIUM_PRESETS.find((p) => p.id === 'leca')!.mix } } },
      })
      out.push({
        id: 'hydro-off',
        factor: 'medium',
        title: 'Remove the reservoir and water conventionally',
        detail: 'This mix is water-retentive enough to grow without standing water.',
        patch: { medium: { semiHydro: { enabled: false } } },
      })
    }
    if (sh.nutrientStrengthPct < 30 || sh.nutrientStrengthPct > 90) {
      out.push({
        id: 'hydro-nutrient',
        factor: 'medium',
        title: 'Use nutrient solution at half strength',
        detail: 'LECA supplies no nutrition. Everything the plant needs has to come from the solution, without overdoing salts.',
        patch: { medium: { semiHydro: { nutrientStrengthPct: 50 } } },
      })
    }
    if (stressMean(result, 'saltBuildup') > 0.02 || sh.flushIntervalDays === 0) {
      out.push({
        id: 'hydro-flush',
        factor: 'medium',
        title: 'Flush the medium every two weeks',
        detail: 'Rinsing with plain water clears mineral salts that concentrate as the reservoir evaporates.',
        patch: { medium: { semiHydro: { flushIntervalDays: 14 } } },
      })
    }
  }

  /* pot size */
  const peakFill = result.snapshots.reduce((m, s) => Math.max(m, s.rootFill), 0)
  if (peakFill > 1.05) {
    const dims = dimsForVolume(config.pot, d.potVolumeL * 1.7)
    out.push({
      id: 'pot-upsize',
      factor: 'medium',
      title: 'Move up a pot size',
      detail: `Roots outgrow this ${d.potVolumeL.toFixed(1)} L pot during the run. A pot about ${Math.round(dims.widthCm)} cm wide gives them room.`,
      patch: { pot: dims },
    })
  }
  if (!d.semiHydro && peakFill < 0.22 && stressMean(result, 'waterlogging') > 0.05) {
    const dims = dimsForVolume(config.pot, Math.max(1.5, d.potVolumeL * 0.5))
    out.push({
      id: 'pot-downsize',
      factor: 'medium',
      title: 'Use a smaller pot',
      detail: 'The pot is much larger than the root system, so the mix stays wet for too long.',
      patch: { pot: dims },
    })
  }

  return out
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x))
}

export function recommend(config: ExperimentConfig, result: SimulationResult, limit = 5): Recommendation[] {
  const recs: Recommendation[] = []
  for (const c of candidates(config, result)) {
    const trial = runSimulation(applyPatch(config, c.patch), result.durationDays)
    const delta = trial.overall - result.overall
    if (delta >= 1) {
      recs.push({ ...c, scoreDelta: delta, newOverall: trial.overall })
    }
  }
  recs.sort((a, b) => b.scoreDelta - a.scoreDelta)
  return recs.slice(0, limit)
}

/* ---------- explanation ---------- */

export interface Explanation {
  headline: string
  suitable: string[]
  problems: string[]
  limiting: string
  risks: string[]
}

function factorSentence(k: FactorKey, config: ExperimentConfig, r: SimulationResult, good: boolean): string {
  const d = r.derived
  const sp = derive(config).species
  switch (k) {
    case 'light': {
      const base = `Light: DLI ≈ ${d.totalDli.toFixed(1)} mol·m⁻²·d⁻¹ (working optimum ${sp.light.dliOptLow}–${sp.light.dliOptHigh})`
      if (good) return `${base}, enough for steady growth.`
      if (stressMean(r, 'scorch') > 0.02) return `${base}, but unfiltered direct sun at ${config.light.ppfd} µmol·m⁻²·s⁻¹ scorches leaves.`
      return d.totalDli < sp.light.dliOptLow ? `${base}, too little to fuel growth.` : `${base}, more than the plant can use.`
    }
    case 'water': {
      if (config.medium.semiHydro.enabled) {
        if (good) return `Water: the reservoir keeps the medium evenly moist with air around most roots.`
        return stressMean(r, 'drought') > stressMean(r, 'waterlogging')
          ? 'Water: the reservoir runs dry between top-ups.'
          : 'Water: too much of the root zone sits in standing water.'
      }
      const base = `Water: ${config.watering.amountMl} ml every ${config.watering.intervalDays} days against about ${Math.round(d.meanWaterUseMl)} ml/day of use`
      if (good) return `${base} keeps moisture in a healthy range.`
      return stressMean(r, 'drought') > stressMean(r, 'waterlogging')
        ? `${base} lets the root zone dry out too far.`
        : `${base} keeps the mix too wet for roots to breathe.`
    }
    case 'humidity': {
      const rh = config.humidity.humidifier ? Math.max(config.humidity.ambientRh, config.humidity.targetRh) : config.humidity.ambientRh
      return good
        ? `Humidity: ${Math.round(rh)} % RH is comfortable for this species.`
        : `Humidity: ${Math.round(rh)} % RH is below the preferred ${sp.humidity.optLowRh}–${sp.humidity.optHighRh} %.`
    }
    case 'temperature': {
      const t = config.temperature
      const base = `Temperature: ${t.minC}–${t.maxC} °C around a ${t.meanC} °C mean`
      if (good) return `${base} suits tropical growth.`
      if (stressMean(r, 'cold') > 0.01) return `${base} dips into chilling-injury range (below ${sp.temperature.damageMinC} °C).`
      if (stressMean(r, 'heat') > 0.01) return `${base} peaks above ${sp.temperature.heatStressC} °C.`
      return t.meanC < sp.temperature.optLowC ? `${base} is cool enough to slow growth.` : `${base} is hotter than ideal.`
    }
    case 'medium': {
      const air = Math.round(d.airPorosity * 100)
      const base = `Medium: about ${air} % air space when wet, ${d.mediumVolumeL.toFixed(1)} L of root room`
      if (good) return `${base}. A well-aerated root zone.`
      const worst = (['rootRot', 'nutrientDeficiency', 'saltBuildup', 'rootBound'] as StressKey[])
        .map((key) => ({ key, v: stressMean(r, key) }))
        .sort((a, b) => b.v - a.v)[0]
      if (worst.v > 0.03) {
        const why: Partial<Record<StressKey, string>> = {
          rootRot: 'roots are damaged by lack of oxygen',
          nutrientDeficiency: 'nutrients run out',
          saltBuildup: 'fertiliser salts accumulate',
          rootBound: 'roots run out of room',
        }
        return `${base}; ${why[worst.key]}.`
      }
      return `${base}, denser than an aroid likes (aim for ${Math.round(sp.medium.airPorosityOpt * 100)} %).`
    }
  }
}

const RISK_TEXT: Record<StressKey, string> = {
  lowLight: 'Low light slows growth, stretches petioles and produces smaller, less split leaves.',
  scorch: 'Direct sun bleaches and browns leaf tissue.',
  drought: 'Repeated drying wilts the plant and crisps leaf edges; oldest leaves yellow first.',
  waterlogging: 'Saturated mix leaves roots without oxygen.',
  rootRot: 'Damaged roots cannot take up water, so the plant wilts and yellows even when wet.',
  dryAir: 'Dry air browns leaf tips and edges.',
  cold: 'Chilling injury blackens leaves and can kill the plant quickly.',
  heat: 'Heat raises water demand and stresses leaves.',
  nutrientDeficiency: 'Pale, slow growth as nutrients run short.',
  saltBuildup: 'Accumulated salts burn root tips and leaf edges.',
  rootBound: 'A crowded root zone dries fast and limits growth.',
}

export function explain(config: ExperimentConfig, r: SimulationResult): Explanation {
  const keys = Object.keys(r.scores) as FactorKey[]
  const suitable = keys.filter((k) => r.scores[k] >= 75).map((k) => factorSentence(k, config, r, true))
  const problems = keys
    .filter((k) => r.scores[k] < 75)
    .sort((a, b) => r.scores[a] - r.scores[b])
    .map((k) => factorSentence(k, config, r, false))
  const lim = r.limitingFactor
  const limiting =
    r.scores[lim] >= 85
      ? 'No single factor is holding the plant back.'
      : `${FACTOR_LABELS[lim]} is the most limiting factor (${r.scores[lim]}/100).`
  const risks = r.stresses
    .filter((s) => s.mean > 0.02 || s.peak > 0.5)
    .slice(0, 4)
    .map((s) => `${RISK_TEXT[s.key]} Active on ${s.daysActive} of ${r.durationDays} days, from day ${s.firstDay}.`)

  const g = r.growth
  let headline: string
  if (!g.survived) headline = `The plant is predicted to die around day ${g.daysToDeath}.`
  else if (g.leavesGrown > 0 && g.leavesLost === 0)
    headline = `Predicted to put out ${g.leavesGrown} new ${g.leavesGrown === 1 ? 'leaf' : 'leaves'} and finish at ${g.finalHealth} % health.`
  else if (g.leavesGrown > 0)
    headline = `Predicted to grow ${g.leavesGrown} and lose ${g.leavesLost} ${g.leavesLost === 1 ? 'leaf' : 'leaves'}, finishing at ${g.finalHealth} % health.`
  else if (g.leavesLost > 0)
    headline = `Predicted to lose ${g.leavesLost} ${g.leavesLost === 1 ? 'leaf' : 'leaves'} with no new growth, finishing at ${g.finalHealth} % health.`
  else headline = `Predicted to hold steady with no new leaves, finishing at ${g.finalHealth} % health.`

  return { headline, suitable, problems, limiting, risks }
}

/* ---------- comparison ---------- */

export interface ConfigRow {
  key: string
  group: string
  label: string
  value: string
}

/** Flatten a config into labelled rows so experiments can be diffed side by side. */
export function describeConfig(c: ExperimentConfig): ConfigRow[] {
  const d = derive(c)
  const onOff = (b: boolean) => (b ? 'Yes' : 'No')
  const lights = c.light.growLights.filter((g) => g.enabled)
  const mixText =
    matchPreset(c.medium.mix, c.medium.semiHydro.enabled)?.label ??
    Object.entries(c.medium.mix)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v}% ${k}`)
      .join(' · ')
  const rows: ConfigRow[] = [
    { key: 'light.ppfd', group: 'Light', label: 'Sun PPFD', value: `${c.light.ppfd} µmol` },
    { key: 'light.hours', group: 'Light', label: 'Exposure', value: `${c.light.hoursPerDay} h ${c.light.exposure}` },
    { key: 'light.grow', group: 'Light', label: 'Grow lights', value: lights.length ? lights.map((g) => `${g.ppfd} µmol × ${g.hoursPerDay} h`).join(', ') : 'None' },
    { key: 'light.dli', group: 'Light', label: 'Total DLI', value: `${d.totalDli.toFixed(1)} mol/m²/d` },
    { key: 'hum.rh', group: 'Humidity', label: 'Ambient RH', value: `${c.humidity.ambientRh} % ± ${c.humidity.fluctuation}` },
    { key: 'hum.hf', group: 'Humidity', label: 'Humidifier', value: c.humidity.humidifier ? `To ${c.humidity.targetRh} %` : 'Off' },
    { key: 'temp', group: 'Temperature', label: 'Range', value: `${c.temperature.minC}–${c.temperature.maxC} °C (mean ${c.temperature.meanC})` },
    { key: 'temp.f', group: 'Temperature', label: 'Fluctuation', value: `± ${c.temperature.fluctuationC} °C` },
    { key: 'med.mix', group: 'Medium', label: 'Mix', value: mixText },
    { key: 'med.sh', group: 'Medium', label: 'Semi-hydro', value: c.medium.semiHydro.enabled ? `Reservoir ${c.medium.semiHydro.reservoirPct} %, nutrients ${c.medium.semiHydro.nutrientStrengthPct} %, flush ${c.medium.semiHydro.flushIntervalDays || 'never'}${c.medium.semiHydro.flushIntervalDays ? ' d' : ''}` : 'No' },
    { key: 'water', group: 'Watering', label: c.medium.semiHydro.enabled ? 'Top-up' : 'Schedule', value: c.medium.semiHydro.enabled ? `Every ${c.watering.intervalDays} d` : `${c.watering.amountMl} ml every ${c.watering.intervalDays} d (${c.watering.method})` },
    { key: 'feed', group: 'Watering', label: 'Fertiliser', value: c.medium.semiHydro.enabled ? 'In solution' : c.watering.feedIntervalDays ? `${c.watering.feedStrengthPct} % every ${c.watering.feedIntervalDays} d` : 'Never' },
    { key: 'pot.mat', group: 'Pot', label: 'Material', value: c.pot.material },
    { key: 'pot.shape', group: 'Pot', label: 'Shape & size', value: `${c.pot.shape}, ${c.pot.widthCm} × ${c.pot.heightCm} cm (${d.potVolumeL.toFixed(1)} L)` },
    { key: 'pot.drain', group: 'Pot', label: 'Drainage holes', value: onOff(c.pot.drainageHoles) },
    { key: 'plant', group: 'Plant', label: 'Starting plant', value: `${c.plant.initialLeafCount} leaves, ${c.plant.initialHealth} % health` },
  ]
  return rows
}
