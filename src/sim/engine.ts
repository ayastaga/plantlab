/**
 * Plant Lab simulation engine.
 *
 * A deterministic, rule-based daily time-step model. Each simulated day it:
 *   1. derives the day's environment (light integral, temperature, humidity, VPD)
 *   2. updates a water balance for the root zone (or reservoir for semi-hydro)
 *   3. updates nutrients, salts and root health
 *   4. turns those into per-factor suitability (0–1) and named stresses (0–1)
 *   5. grows, ages, damages or drops individual leaves
 *
 * It is an estimate built from transparent assumptions, not a validated
 * physiological model. Identical inputs always produce identical outputs.
 */
import { growDli, sunDli, vpdKpa } from './light'
import { mixProperties } from './media'
import { MEDIUM_FILL, POT_MATERIALS, potDrains, potVolumeL, surfaceAreaM2 } from './pots'
import { getSpecies } from './species'
import type {
  DaySnapshot,
  ExperimentConfig,
  FactorKey,
  LeafState,
  SimEvent,
  SimulationResult,
  SpeciesProfile,
  StressKey,
  StressSummary,
  Verdict,
} from './types'

/* ---------- small maths helpers ---------- */

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => {
  const c = clamp(t)
  return c * c * (3 - 2 * c)
}
/** 0 below a, rises to 1 at b, flat to c, falls to `tail` at d and beyond. */
function plateau(x: number, a: number, b: number, c: number, d: number, tail = 0): number {
  if (x <= a) return 0
  if (x < b) return smooth((x - a) / (b - a))
  if (x <= c) return 1
  if (x < d) return lerp(1, tail, smooth((x - c) / (d - c)))
  return tail
}

/** Deterministic hash → [0, 1). */
function hash(seed: number, n: number, channel: number): number {
  let h = (seed | 0) * 374761393 + (n | 0) * 668265263 + (channel | 0) * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 100000) / 100000
}

/** Smooth value noise in [-1, 1] that drifts over a few days, like weather. */
function drift(seed: number, day: number, channel: number, period = 4): number {
  const x = day / period
  const i = Math.floor(x)
  const f = smooth(x - i)
  return lerp(hash(seed, i, channel), hash(seed, i + 1, channel), f) * 2 - 1
}

/* ---------- labels ---------- */

export const FACTOR_LABELS: Record<FactorKey, string> = {
  light: 'Light',
  water: 'Water',
  humidity: 'Humidity',
  temperature: 'Temperature',
  medium: 'Growing medium',
}

export const STRESS_LABELS: Record<StressKey, string> = {
  lowLight: 'Insufficient light',
  scorch: 'Leaf scorch',
  drought: 'Drought',
  waterlogging: 'Waterlogged roots',
  rootRot: 'Root rot',
  dryAir: 'Dry air',
  cold: 'Cold injury',
  heat: 'Heat stress',
  nutrientDeficiency: 'Nutrient deficiency',
  saltBuildup: 'Fertiliser salt build-up',
  rootBound: 'Root-bound',
}

const STRESS_KEYS = Object.keys(STRESS_LABELS) as StressKey[]
const FACTOR_KEYS = Object.keys(FACTOR_LABELS) as FactorKey[]

/** Weight of each factor in the mean part of the conditions score. */
export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  light: 0.26,
  water: 0.26,
  humidity: 0.12,
  temperature: 0.18,
  medium: 0.18,
}

/* ---------- derived, time-independent quantities ---------- */

export interface Derived {
  species: SpeciesProfile
  sunDli: number
  growDli: number
  totalDli: number
  potVolumeL: number
  mediumVolumeL: number
  /** Plant-available water at container capacity, ml */
  capacityMl: number
  /** Extra water that fits in air pores when saturated, ml */
  saturationExtraMl: number
  airPorosity: number
  waterHolding: number
  drainage: number
  nutrientHolding: number
  nutrientCharge: number
  wicking: number
  drains: boolean
  evaporationFactor: number
  surfaceM2: number
  semiHydro: boolean
  reservoirMaxMl: number
  /** 0–1, how saturated the mix above a reservoir stays through capillary rise */
  capillarySaturation: number
}

export function derive(config: ExperimentConfig): Derived {
  const species = getSpecies(config.speciesId)
  const mix = mixProperties(config.medium.mix)
  const mat = POT_MATERIALS[config.pot.material]
  const volL = potVolumeL(config.pot)
  const medL = volL * MEDIUM_FILL
  const airPorosity = mix.airPorosity + mat.aerationBonus
  const semiHydro = config.medium.semiHydro.enabled
  return {
    species,
    sunDli: sunDli(config.light),
    growDli: growDli(config.light),
    totalDli: sunDli(config.light) + growDli(config.light),
    potVolumeL: volL,
    mediumVolumeL: medL,
    capacityMl: mix.waterHolding * medL * 1000,
    saturationExtraMl: airPorosity * medL * 1000,
    airPorosity,
    waterHolding: mix.waterHolding,
    drainage: mix.drainage,
    nutrientHolding: mix.nutrientHolding,
    nutrientCharge: mix.nutrientCharge,
    wicking: mix.wicking,
    drains: potDrains(config.pot),
    evaporationFactor: mat.evaporation,
    surfaceM2: surfaceAreaM2(config.pot),
    semiHydro,
    reservoirMaxMl: (config.medium.semiHydro.reservoirPct / 100) * volL * 1000 * 0.5,
    capillarySaturation: clamp((mix.waterHolding - 0.12) / 0.2),
  }
}

/* ---------- suitability curves (shared with the UI for live read-outs) ---------- */

export function lightSuitability(sp: SpeciesProfile, dliValue: number): number {
  const l = sp.light
  if (dliValue <= l.dliLow) return 0.45 * smooth((dliValue - l.dliMin * 0.5) / Math.max(0.05, l.dliLow - l.dliMin * 0.5))
  if (dliValue < l.dliOptLow) return lerp(0.45, 1, smooth((dliValue - l.dliLow) / (l.dliOptLow - l.dliLow)))
  return plateau(dliValue, 0, l.dliOptLow, l.dliOptHigh, l.dliHigh, 0.55)
}

/** Growth response to light: zero at the survival minimum. */
function lightGrowth(sp: SpeciesProfile, dliValue: number): number {
  const l = sp.light
  return plateau(dliValue, l.dliMin, l.dliOptLow, l.dliOptHigh, l.dliHigh, 0.6)
}

export function temperatureGrowth(sp: SpeciesProfile, tC: number): number {
  const t = sp.temperature
  return plateau(tC, t.growthMinC, t.optLowC, t.optHighC, t.growthMaxC, 0)
}

export function humiditySuitability(sp: SpeciesProfile, rh: number): number {
  const h = sp.humidity
  // dry air slows growth and marks leaves but is not treated as fatal on its own
  if (rh < h.optLowRh) return lerp(0.5, 1, clamp((rh - (h.severeBelowRh - 10)) / (h.optLowRh - (h.severeBelowRh - 10))))
  return plateau(rh, 0, h.optLowRh, h.optHighRh, 100, 0.8)
}

export function leafAreaM2(leaves: LeafState[], aspect = 1): number {
  let a = 0
  for (const l of leaves) {
    const len = l.sizeCm * l.expansion
    a += 0.5 * aspect * len * len * (1 - 0.25 * l.fenestration) * (1 - 0.6 * l.brown)
  }
  return a / 10000
}

function fenestrationFor(sp: SpeciesProfile, sizeCm: number, lightFactor: number): number {
  const g = sp.growth
  const span = Math.max(1, g.matureLeafCm - g.juvenileLeafCm)
  const maturity = clamp((sizeCm - g.juvenileLeafCm - span * 0.08) / (span * 0.72))
  return clamp(maturity * (0.45 + 0.55 * lightFactor)) * sp.leaf.fenestration
}

/* ---------- initial state ---------- */

interface State {
  leaves: LeafState[]
  nextLeafId: number
  leafProgress: number
  growthSinceLeaf: number
  daysSinceLeaf: number
  leavesGrown: number
  leavesLost: number
  health: number
  rootHealth: number
  etiolation: number
  chlorosis: number
  /** ml of plant-available water in the medium (conventional) */
  waterMl: number
  /** moisture fraction (semi-hydro tracks it directly) */
  theta: number
  reservoirMl: number
  nutrients: number
  salts: number
  droughtChronic: number
  lastGrowth: number
  alive: boolean
}

function initialState(config: ExperimentConfig, d: Derived): State {
  const sp = d.species
  const h = clamp(config.plant.initialHealth / 100)
  const n = Math.max(1, Math.round(config.plant.initialLeafCount))
  const light0 = lightGrowth(sp, d.totalDli)
  const leaves: LeafState[] = []
  for (let i = 0; i < n; i++) {
    const span = sp.growth.matureLeafCm - sp.growth.juvenileLeafCm
    const sizeCm = clamp(sp.growth.juvenileLeafCm + span * (0.12 + (0.4 * i) / n), sp.growth.juvenileLeafCm, sp.growth.matureLeafCm)
    // a tired plant starts with its oldest leaves already marked
    const wear = clamp((0.75 - h) * 2) * clamp(1 - i / Math.max(1, n * 0.5))
    leaves.push({
      id: i,
      bornDay: -(n - i) * sp.growth.leafIntervalDays,
      expansion: 1,
      sizeCm,
      fenestration: fenestrationFor(sp, sizeCm, Math.max(light0, 0.6)),
      yellow: wear * 0.7,
      brown: wear * 0.25,
      seed: Math.floor(hash(config.seed, i, 11) * 100000),
    })
  }
  return {
    leaves,
    nextLeafId: n,
    leafProgress: 0.35,
    growthSinceLeaf: 0,
    daysSinceLeaf: 0,
    leavesGrown: 0,
    leavesLost: 0,
    health: clamp(config.plant.initialHealth, 1, 100),
    rootHealth: lerp(0.45, 1, h),
    etiolation: 1,
    chlorosis: clamp((0.6 - h) * 0.8),
    waterMl: d.capacityMl * 0.75,
    theta: 0.75,
    reservoirMl: d.reservoirMaxMl,
    nutrients: d.semiHydro ? config.medium.semiHydro.nutrientStrengthPct / 100 : d.nutrientCharge,
    salts: 0,
    droughtChronic: 0,
    lastGrowth: 0.5,
    alive: true,
  }
}

const zeroStress = (): Record<StressKey, number> => ({
  lowLight: 0,
  scorch: 0,
  drought: 0,
  waterlogging: 0,
  rootRot: 0,
  dryAir: 0,
  cold: 0,
  heat: 0,
  nutrientDeficiency: 0,
  saltBuildup: 0,
  rootBound: 0,
})

/* ---------- one simulated day ---------- */

function step(config: ExperimentConfig, d: Derived, s: State, day: number, events: SimEvent[]): DaySnapshot {
  const sp = d.species
  const stress = zeroStress()

  /* 1. environment */
  const tNoise = drift(config.seed, day, 1)
  const hNoise = drift(config.seed, day, 2, 3)
  const tShift = config.temperature.fluctuationC * tNoise
  const tMean = config.temperature.meanC + tShift
  const tMin = Math.min(config.temperature.minC, config.temperature.meanC) + tShift
  const tMax = Math.max(config.temperature.maxC, config.temperature.meanC) + tShift
  const ambient = config.humidity.ambientRh + config.humidity.fluctuation * hNoise
  const rh = clamp(config.humidity.humidifier ? Math.max(ambient, config.humidity.targetRh) : ambient, 5, 100)
  const vpd = vpdKpa(tMean, rh)
  const dliToday = d.totalDli

  /* 2. light */
  const lightG = lightGrowth(sp, dliToday)
  stress.lowLight = clamp((sp.light.dliOptLow - dliToday) / (sp.light.dliOptLow - sp.light.dliMin * 0.5))
  if (config.light.exposure === 'direct' && config.light.ppfd > sp.light.scorchPpfd) {
    stress.scorch =
      clamp((config.light.ppfd - sp.light.scorchPpfd) / sp.light.scorchPpfd) * clamp(config.light.hoursPerDay / 4)
  }
  // below the maintenance level the plant runs down its reserves
  const starvation = clamp((sp.light.dliLow - dliToday) / Math.max(0.05, sp.light.dliLow - sp.light.dliMin * 0.5))

  /* 3. temperature */
  const tempG = temperatureGrowth(sp, tMean)
  stress.cold = clamp((sp.temperature.damageMinC - tMin) / (sp.temperature.damageMinC - sp.temperature.lethalMinC))
  stress.heat = clamp((tMax - sp.temperature.heatStressC) / 8)

  /* 4. humidity */
  stress.dryAir = clamp((sp.humidity.stressBelowRh - rh) / (sp.humidity.stressBelowRh - sp.humidity.severeBelowRh))
  const humS = humiditySuitability(sp, rh)

  /* 5. root zone size */
  const area = leafAreaM2(s.leaves, sp.leaf.aspect)
  const rootFill = (area * sp.growth.rootVolumeLPerM2 * (0.5 + 0.5 * s.rootHealth)) / Math.max(0.05, d.mediumVolumeL)
  stress.rootBound = clamp((rootFill - 1) / 0.8)

  /* 6. water demand */
  const lightDrive = 0.3 + 0.7 * clamp(dliToday / 8, 0, 1.6)
  const vpdDrive = clamp(vpd / 1.2, 0.25, 2.5)
  const thetaBefore = d.semiHydro ? s.theta : s.waterMl / Math.max(1, d.capacityMl)
  const stomata = clamp(thetaBefore / 0.35, 0.08, 1) * (0.25 + 0.75 * tempG) * (0.3 + 0.7 * s.rootHealth)
  const transpiration = s.alive ? area * sp.growth.transpirationMlPerM2 * lightDrive * vpdDrive * stomata : 0
  const evaporation =
    d.surfaceM2 * 600 * vpdDrive * d.evaporationFactor * clamp(thetaBefore, 0.1, 1) * (d.semiHydro ? 0.6 : 1)
  const waterUse = transpiration + evaporation

  /* 7. water balance */
  const wateringDay = day % Math.max(1, Math.round(config.watering.intervalDays)) === 0
  let watered = false
  let fed = false
  let anoxia = 0
  let theta: number
  let drainedFraction = 0

  if (d.semiHydro) {
    const sh = config.medium.semiHydro
    if (wateringDay) {
      s.reservoirMl = d.reservoirMaxMl
      watered = true
    }
    s.reservoirMl = Math.max(0, s.reservoirMl - waterUse)
    const wet = d.reservoirMaxMl > 0 && s.reservoirMl > 0
    const target = wet ? 0.35 + 0.6 * d.wicking : 0
    // the medium follows the reservoir: quick to wet, dries at a rate set by how much it holds
    s.theta = wet ? lerp(s.theta, target, 0.6) : Math.max(0, s.theta - lerp(0.3, 0.06, clamp(d.waterHolding / 0.4)))
    theta = s.theta
    if (wet) {
      const fill = s.reservoirMl / d.reservoirMaxMl
      const submerged = clamp((sh.reservoirPct / 100 - 0.35) / 0.4) * (0.5 + 0.5 * fill)
      anoxia = Math.max(submerged, d.capillarySaturation * 0.9)
    }
    // nutrients come from the solution; salts concentrate as water evaporates
    s.nutrients = wet ? sh.nutrientStrengthPct / 100 : s.nutrients * 0.9
    s.salts += 0.0045 * (sh.nutrientStrengthPct / 50) * clamp(waterUse / 60, 0.4, 2)
    if (sh.flushIntervalDays > 0 && day > 0 && day % Math.round(sh.flushIntervalDays) === 0) {
      s.salts *= 0.1
    }
    fed = watered && sh.nutrientStrengthPct > 0
  } else {
    if (wateringDay) {
      watered = true
      const amount = config.watering.amountMl
      if (config.watering.method === 'bottom') {
        // soaks up from a tray: only works through drainage holes, never over-fills, never leaches
        if (d.drains) s.waterMl = Math.max(s.waterMl, Math.min(d.capacityMl * 0.97, s.waterMl + amount))
      } else {
        s.waterMl += amount
      }
    }
    const maxMl = d.capacityMl + d.saturationExtraMl
    if (s.waterMl > maxMl) s.waterMl = maxMl // overflows the rim
    if (s.waterMl > d.capacityMl) {
      const excess = s.waterMl - d.capacityMl
      if (d.drains) {
        const rate = 0.55 + 0.45 * d.drainage
        const drained = excess * rate
        s.waterMl -= drained
        drainedFraction = clamp(drained / Math.max(1, d.capacityMl))
      }
    }
    s.waterMl = Math.max(0, s.waterMl - waterUse)
    theta = s.waterMl / Math.max(1, d.capacityMl)
    s.theta = theta

    // air left in the pores at this water content
    const excessFill = clamp((s.waterMl - d.capacityMl) / Math.max(1, d.saturationExtraMl))
    const airNow = d.airPorosity * (1 - excessFill) + d.waterHolding * (1 - clamp(theta)) * 0.9
    anoxia = clamp((sp.water.airNeed - airNow) / sp.water.airNeed)

    // nutrients: feeding, uptake, leaching
    const feedEvery = Math.round(config.watering.feedIntervalDays)
    if (feedEvery > 0 && day > 0 && day % feedEvery === 0) {
      fed = true
      const dose = config.watering.feedStrengthPct / 50
      s.nutrients = Math.min(1.6, s.nutrients + 0.09 * dose * (0.45 + 0.55 * d.nutrientHolding))
      s.salts += 0.014 * dose
    }
    s.nutrients *= 1 - 0.18 * drainedFraction * (1 - 0.6 * d.nutrientHolding)
    // uptake follows yesterday's growth, and rises when nutrients are plentiful
    s.nutrients = Math.max(0, s.nutrients - (0.0005 + 0.0035 * s.lastGrowth) * clamp(s.nutrients / 0.6, 0.3, 2))
    s.salts *= 1 - 0.7 * clamp(drainedFraction * 4)
    s.salts *= 0.995 // slow uptake / dilution between feeds
  }

  // plants that store water (succulents, rhizomes) feel a dry root zone much less
  const hardy = sp.water.droughtHardiness
  stress.drought =
    clamp((sp.water.droughtStartTheta - theta) / Math.max(0.02, sp.water.droughtStartTheta - 0.02)) * (1 - 0.75 * hardy)
  // brief dry spells before a watering matter less than staying dry
  s.droughtChronic = lerp(s.droughtChronic, stress.drought, 0.15 * (1 - 0.8 * hardy))
  stress.waterlogging = anoxia

  /* 8. roots */
  if (s.alive) {
    const warm = 0.5 + 0.5 * clamp((tMean - 10) / 15)
    s.rootHealth -= 0.035 * anoxia * warm
    s.rootHealth -= 0.008 * stress.drought
    s.rootHealth -= 0.02 * stress.cold
    if (anoxia < 0.1 && stress.drought < 0.3) s.rootHealth += 0.012 * tempG
    s.rootHealth = clamp(s.rootHealth, 0, 1)
  }
  stress.rootRot = clamp((0.8 - s.rootHealth) / 0.6)

  /* 9. nutrients */
  stress.nutrientDeficiency = 1 - clamp(s.nutrients / 0.3)
  s.salts = clamp(s.salts + clamp((s.nutrients - 1.15) * 0.02, 0, 0.02), 0, 1.5)
  stress.saltBuildup = clamp((s.salts - 0.3) / 0.5)
  const nutrientG = 0.35 + 0.65 * clamp(s.nutrients / 0.4)

  /* 10. per-factor suitability for today */
  const factors: Record<FactorKey, number> = {
    light: lightSuitability(sp, dliToday) * (1 - 0.6 * stress.scorch),
    water: 1 - Math.max(stress.drought, anoxia),
    humidity: humS,
    temperature: lerp(0.1, 1, tempG) * (1 - stress.cold) * (1 - 0.8 * stress.heat),
    medium:
      (0.4 * clamp(lerp(0.25, 1, (d.airPorosity * (d.semiHydro ? 1 - d.capillarySaturation : 1)) / sp.medium.airPorosityOpt)) +
        0.25 * (1 - stress.nutrientDeficiency * 0.9) +
        0.15 * (1 - stress.saltBuildup) +
        0.2 * (1 - stress.rootBound)) *
      (0.45 + 0.55 * s.rootHealth) *
      (1 - 0.7 * stress.nutrientDeficiency),
  }
  for (const k of FACTOR_KEYS) factors[k] = clamp(factors[k])

  /* 11. growth */
  let growthRate = 0
  if (s.alive) {
    const waterG = (1 - stress.drought) * (1 - 0.7 * anoxia)
    growthRate =
      lightG *
      tempG *
      waterG *
      nutrientG *
      (0.7 + 0.3 * humS) *
      (1 - 0.5 * stress.rootBound) *
      Math.sqrt(s.rootHealth) *
      (1 - 0.5 * stress.saltBuildup) *
      (1 - 0.5 * stress.scorch) *
      (1 - stress.cold) *
      Math.sqrt(clamp(s.health / 100))
    growthRate = clamp(growthRate)
    s.lastGrowth = growthRate

    s.leafProgress += growthRate / sp.growth.leafIntervalDays
    s.growthSinceLeaf += growthRate
    s.daysSinceLeaf += 1

    const living = s.leaves.length
    if (s.leafProgress >= 1 && living < sp.growth.maxLeaves) {
      s.leafProgress -= 1
      const vigour = s.growthSinceLeaf / Math.max(1, s.daysSinceLeaf)
      const newest = s.leaves.length ? s.leaves[s.leaves.length - 1].sizeCm : sp.growth.juvenileLeafCm
      const sizeCm = clamp(newest * (0.9 + 0.24 * vigour), sp.growth.juvenileLeafCm, sp.growth.matureLeafCm)
      const leaf: LeafState = {
        id: s.nextLeafId,
        bornDay: day,
        expansion: 0.08,
        sizeCm,
        fenestration: fenestrationFor(sp, sizeCm, lightG),
        yellow: 0,
        brown: 0,
        seed: Math.floor(hash(config.seed, s.nextLeafId, 11) * 100000),
      }
      s.leaves.push(leaf)
      s.nextLeafId += 1
      s.leavesGrown += 1
      s.growthSinceLeaf = 0
      s.daysSinceLeaf = 0
      events.push({ day, kind: 'newLeaf', message: `New leaf unfurling (${Math.round(sizeCm)} cm)` })
    }
    for (const leaf of s.leaves) {
      if (leaf.expansion < 1) {
        leaf.expansion = Math.min(1, leaf.expansion + (0.25 + 0.75 * Math.min(1, growthRate * 1.6)) / sp.growth.leafExpansionDays)
      }
    }

    const stretchTarget =
      1 + 0.55 * clamp((sp.light.dliOptLow - dliToday) / (sp.light.dliOptLow - sp.light.dliMin)) * (dliToday > 0.3 ? 1 : 0.4)
    s.etiolation = lerp(s.etiolation, stretchTarget, 0.02)
  }

  /* 12. leaf damage */
  if (s.alive) {
    // the plant sheds its oldest leaves first when it cannot support them
    const shed = Math.max(
      stress.rootRot * 0.9,
      starvation * 0.8,
      s.droughtChronic * 0.8,
      stress.nutrientDeficiency * 0.35,
      stress.saltBuildup * 0.4,
      stress.heat * 0.4,
    )
    let weight = 1
    for (const leaf of s.leaves) {
      if (leaf.expansion < 0.5) continue
      leaf.yellow = clamp(leaf.yellow + shed * 0.06 * weight)
      if (shed < 0.05 && leaf.yellow < 0.25) leaf.yellow = Math.max(0, leaf.yellow - 0.008)
      weight *= 0.55
      if (weight < 0.02) break
    }
    const n = s.leaves.length
    s.leaves.forEach((leaf, i) => {
      const top = n > 1 ? i / (n - 1) : 1
      const tipCap = Math.max(0.3 * stress.dryAir, 0.38 * stress.saltBuildup)
      if (leaf.brown < tipCap) leaf.brown = Math.min(tipCap, leaf.brown + 0.012)
      const scorchCap = 0.25 + 0.55 * stress.scorch * (0.7 + 0.3 * top)
      if (stress.scorch > 0 && leaf.brown < scorchCap) leaf.brown = Math.min(scorchCap, leaf.brown + 0.02 * stress.scorch)
      leaf.brown += 0.09 * stress.cold
      leaf.brown += 0.025 * clamp((stress.drought - 0.75) / 0.25)
      leaf.brown += 0.02 * clamp((leaf.yellow - 0.7) / 0.3)
      leaf.brown = clamp(leaf.brown)
    })
    const kept: LeafState[] = []
    for (const leaf of s.leaves) {
      if (leaf.yellow >= 1 || leaf.brown >= 0.9) {
        s.leavesLost += 1
        events.push({ day, kind: 'leafLost', message: leaf.brown >= 0.9 ? 'Leaf died back and dropped' : 'Yellowed leaf dropped' })
      } else kept.push(leaf)
    }
    s.leaves = kept

    const paleTarget = Math.max(stress.nutrientDeficiency * 0.7, stress.scorch * 0.45, stress.rootRot * 0.4, stress.saltBuildup * 0.3)
    s.chlorosis = lerp(s.chlorosis, paleTarget, 0.05)
  }

  /* 13. health */
  if (s.alive) {
    const vals = FACTOR_KEYS.map((k) => factors[k])
    const mean = FACTOR_KEYS.reduce((a, k) => a + factors[k] * FACTOR_WEIGHTS[k], 0)
    const target = 100 * (0.55 * Math.min(...vals) + 0.45 * mean)
    const rate = target < s.health ? 0.045 : 0.03
    s.health += (target - s.health) * rate
    s.health -= 3.5 * stress.cold + 0.4 * stress.scorch + 1.5 * stress.rootRot * stress.rootRot + 1.2 * starvation * starvation
    if (s.leaves.length === 0) s.health -= 2
    s.health = clamp(s.health, 0, 100)
    if (s.health <= 1 || (s.leaves.length === 0 && (s.rootHealth < 0.25 || s.health < 10))) {
      s.alive = false
      s.health = 0
      events.push({ day, kind: 'death', message: 'The plant did not survive' })
    }
  }

  const turgor = s.alive
    ? clamp(Math.min(1 - 0.85 * stress.drought, 0.35 + 0.65 * s.rootHealth / 0.8, 1 - 0.6 * stress.cold, 1 - 0.35 * stress.heat))
    : 0.05

  return {
    day,
    alive: s.alive,
    health: s.health,
    leaves: s.leaves.map((l) => ({ ...l })),
    nodeCount: s.nextLeafId,
    leavesGrown: s.leavesGrown,
    leavesLost: s.leavesLost,
    turgor,
    etiolation: s.etiolation,
    chlorosis: s.chlorosis,
    rootHealth: s.rootHealth,
    rootFill,
    moisture: theta,
    reservoir: d.semiHydro && d.reservoirMaxMl > 0 ? s.reservoirMl / d.reservoirMaxMl : 0,
    nutrients: s.nutrients,
    salts: s.salts,
    growthRate,
    waterUseMl: waterUse,
    watered,
    fed,
    env: { dli: dliToday, tMeanC: tMean, tMinC: tMin, tMaxC: tMax, rh, vpdKpa: vpd },
    factors,
    stress,
  }
}

/* ---------- public API ---------- */

/** The plant as configured, before any time has passed. */
export function initialSnapshot(config: ExperimentConfig): DaySnapshot {
  const d = derive(config)
  const s = initialState(config, d)
  const area = leafAreaM2(s.leaves, d.species.leaf.aspect)
  const rh = clamp(
    config.humidity.humidifier ? Math.max(config.humidity.ambientRh, config.humidity.targetRh) : config.humidity.ambientRh,
    5,
    100,
  )
  return {
    day: 0,
    alive: true,
    health: s.health,
    leaves: s.leaves,
    nodeCount: s.nextLeafId,
    leavesGrown: 0,
    leavesLost: 0,
    turgor: clamp(0.35 + (0.65 * s.rootHealth) / 0.8),
    etiolation: 1,
    chlorosis: s.chlorosis,
    rootHealth: s.rootHealth,
    rootFill: (area * d.species.growth.rootVolumeLPerM2 * (0.5 + 0.5 * s.rootHealth)) / Math.max(0.05, d.mediumVolumeL),
    moisture: s.theta,
    reservoir: d.semiHydro ? 1 : 0,
    nutrients: s.nutrients,
    salts: 0,
    growthRate: 0,
    waterUseMl: 0,
    watered: false,
    fed: false,
    env: {
      dli: d.totalDli,
      tMeanC: config.temperature.meanC,
      tMinC: config.temperature.minC,
      tMaxC: config.temperature.maxC,
      rh,
      vpdKpa: vpdKpa(config.temperature.meanC, rh),
    },
    factors: { light: 0, water: 0, humidity: 0, temperature: 0, medium: 0 },
    stress: zeroStress(),
  }
}

export function verdictFor(score: number): Verdict {
  if (score >= 85) return 'Excellent growing potential'
  if (score >= 70) return 'Suitable conditions'
  if (score >= 55) return 'Suitable with adjustments'
  if (score >= 35) return 'High stress risk'
  return 'Unsuitable conditions'
}

export function runSimulation(config: ExperimentConfig, durationDays: number): SimulationResult {
  const d = derive(config)
  const s = initialState(config, d)
  const events: SimEvent[] = []
  const snapshots: DaySnapshot[] = [initialSnapshot(config)]
  const days = Math.max(1, Math.round(durationDays))

  const factorSum: Record<FactorKey, number> = { light: 0, water: 0, humidity: 0, temperature: 0, medium: 0 }
  const stressSum = zeroStress()
  const stressPeak = zeroStress()
  const stressDays = zeroStress()
  const stressFirst: Partial<Record<StressKey, number>> = {}
  let healthSum = 0
  let growthSum = 0
  let waterUseSum = 0
  let daysToDeath: number | null = null

  for (let day = 1; day <= days; day++) {
    const snap = step(config, d, s, day, events)
    snapshots.push(snap)
    for (const k of FACTOR_KEYS) factorSum[k] += snap.factors[k]
    for (const k of STRESS_KEYS) {
      const v = snap.stress[k]
      stressSum[k] += v
      if (v > stressPeak[k]) stressPeak[k] = v
      if (v > 0.15) {
        stressDays[k] += 1
        if (stressFirst[k] === undefined) {
          stressFirst[k] = day
          events.push({ day, kind: 'stressStart', stress: k, message: `Onset: ${STRESS_LABELS[k].toLowerCase()}` })
        }
      }
    }
    healthSum += snap.health
    growthSum += snap.growthRate
    waterUseSum += snap.waterUseMl
    if (!snap.alive && daysToDeath === null) daysToDeath = day
  }
  // day 0 shows the first day's suitability so the read-outs are never blank
  snapshots[0].factors = { ...snapshots[1].factors }
  snapshots[0].growthRate = snapshots[1].growthRate

  const scores = {} as Record<FactorKey, number>
  for (const k of FACTOR_KEYS) scores[k] = Math.round((factorSum[k] / days) * 100)
  const limitingFactor = FACTOR_KEYS.reduce((a, b) => (scores[b] < scores[a] ? b : a))
  const weighted = FACTOR_KEYS.reduce((a, k) => a + scores[k] * FACTOR_WEIGHTS[k], 0)
  const conditionsScore = 0.5 * scores[limitingFactor] + 0.5 * weighted
  const meanHealth = healthSum / days
  let overall = Math.round(0.7 * conditionsScore + 0.3 * meanHealth)
  if (daysToDeath !== null) overall = Math.min(overall, 20)

  const stresses: StressSummary[] = STRESS_KEYS.map((key) => ({
    key,
    label: STRESS_LABELS[key],
    mean: stressSum[key] / days,
    peak: stressPeak[key],
    daysActive: stressDays[key],
    firstDay: stressFirst[key] ?? -1,
  }))
    .filter((x) => x.daysActive > 0)
    .sort((a, b) => b.mean - a.mean)

  const last = snapshots[snapshots.length - 1]
  const meanWaterUse = waterUseSum / days
  // re-water when moisture falls to the species' re-water point; refill plus ~15 % run-off
  const usable = d.capacityMl * (1 - d.species.water.rewaterTheta)
  const suggestedIntervalDays = clamp(Math.round(usable / Math.max(8, meanWaterUse)), 2, 30)
  const suggestedAmountMl = Math.max(50, Math.round((usable * 1.15) / 50) * 50)

  events.sort((a, b) => a.day - b.day)

  return {
    durationDays: days,
    snapshots,
    events,
    scores,
    overall: clamp(overall, 0, 100),
    conditionsScore: Math.round(conditionsScore),
    meanHealth: Math.round(meanHealth),
    verdict: verdictFor(overall),
    limitingFactor,
    stresses,
    growth: {
      potentialPct: Math.round((growthSum / days) * 100),
      leavesGrown: last.leavesGrown,
      leavesLost: last.leavesLost,
      finalLeafCount: last.leaves.length,
      finalHealth: Math.round(last.health),
      survived: daysToDeath === null,
      daysToDeath,
    },
    derived: {
      sunDli: d.sunDli,
      growDli: d.growDli,
      totalDli: d.totalDli,
      potVolumeL: d.potVolumeL,
      mediumVolumeL: d.mediumVolumeL,
      availableWaterMl: d.capacityMl,
      airPorosity: d.airPorosity,
      meanWaterUseMl: meanWaterUse,
      suggestedIntervalDays,
      suggestedAmountMl,
    },
  }
}
