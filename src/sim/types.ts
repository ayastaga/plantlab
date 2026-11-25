/**
 * Plant Lab simulation types.
 *
 * Everything in src/sim is plain TypeScript with no React / Three.js imports,
 * so the engine can run in a worker, a test, or a future Tauri backend.
 */

export type MediumComponentId =
  | 'pottingSoil'
  | 'perlite'
  | 'pumice'
  | 'orchidBark'
  | 'cocoCoir'
  | 'leca'
  | 'cactusMix'

export type MediumMix = Record<MediumComponentId, number>

export type PotMaterialId = 'terracotta' | 'ceramic' | 'plastic' | 'concrete' | 'fabric' | 'glass'
export type PotShapeId = 'tapered' | 'cylinder' | 'bowl' | 'square'

export interface GrowLight {
  id: string
  name: string
  enabled: boolean
  /** Photosynthetic photon flux density delivered at the canopy, µmol·m⁻²·s⁻¹ */
  ppfd: number
  hoursPerDay: number
  colorK: number
}

export interface ExperimentConfig {
  version: 1
  /** Seed for the deterministic day-to-day fluctuation noise and leaf variation. */
  seed: number
  /** Scene/environment mode. Only 'studio' is implemented; 'room' is reserved. */
  environmentMode: 'studio' | 'room'
  speciesId: string
  plant: {
    initialLeafCount: number
    /** 0–100 */
    initialHealth: number
  }
  light: {
    /** Average PPFD at the canopy while the sun source is on, µmol·m⁻²·s⁻¹ */
    ppfd: number
    hoursPerDay: number
    exposure: 'direct' | 'indirect'
    azimuthDeg: number
    elevationDeg: number
    /** Cosmetic only (correlated colour temperature of the visual light). */
    colorK: number
    growLights: GrowLight[]
  }
  humidity: {
    ambientRh: number
    /** ± day-to-day swing in RH percentage points */
    fluctuation: number
    humidifier: boolean
    targetRh: number
  }
  temperature: {
    meanC: number
    /** Typical night-time low */
    minC: number
    /** Typical day-time high */
    maxC: number
    /** ± day-to-day swing, °C */
    fluctuationC: number
  }
  watering: {
    intervalDays: number
    amountMl: number
    method: 'top' | 'bottom'
    /** 0 = never fertilise (conventional media only) */
    feedIntervalDays: number
    /** % of label-rate fertiliser strength */
    feedStrengthPct: number
  }
  pot: {
    material: PotMaterialId
    shape: PotShapeId
    heightCm: number
    widthCm: number
    /** Cosmetic only. */
    color: string
    drainageHoles: boolean
  }
  medium: {
    mix: MediumMix
    semiHydro: {
      enabled: boolean
      /** Reservoir height as % of pot height */
      reservoirPct: number
      /** % of label-rate hydroponic nutrient strength */
      nutrientStrengthPct: number
      /** 0 = never flush */
      flushIntervalDays: number
    }
  }
  /** User-renamed scene objects (cosmetic). */
  names: Record<string, string>
}

export type SymptomKey =
  | 'yellowLower'
  | 'paleAll'
  | 'brownTips'
  | 'brownPatches'
  | 'drooping'
  | 'leggy'
  | 'noGrowth'
  | 'smallNewLeaves'
  | 'leafDrop'
  | 'mushyBase'

/** What the owner actually sees on their real plant. */
export interface Observation {
  symptoms: SymptomKey[]
  note: string
  /** Where the symptoms came from */
  source: 'manual' | 'photo'
  at: number
}

export interface Experiment {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  durationDays: number
  config: ExperimentConfig
  observation?: Observation
}

export type GrowthHabit = 'climber' | 'cane' | 'rosette' | 'trailing'
export type LeafShape = 'cordate' | 'ovate' | 'lanceolate' | 'strap' | 'round'

/* ---------- species ---------- */

export interface SpeciesProfile {
  id: string
  commonName: string
  scientificName: string
  summary: string
  /** Short care-group label, e.g. "Tropical aroid" */
  archetype: string
  /** 'curated' profiles were written by hand; 'ai' profiles are model-generated estimates. */
  source: 'curated' | 'ai'
  confidence: 'high' | 'medium' | 'low'
  toxicToPets: boolean | null
  /** Overall plant form, used by the procedural renderer */
  habit: GrowthHabit
  leaf: {
    shape: LeafShape
    /** Blade width / length */
    aspect: number
    /** 0–1 maximum splitting (0 for entire leaves) */
    fenestration: number
    color: string
    newColor: string
    /** Margin colour for variegated edges, or null */
    edgeColor: string | null
    /** 0 = soft and arching, 1 = rigid and upright */
    stiffness: number
    /** Petiole length as a multiple of blade length */
    petioleRatio: number
    internodeCm: number
  }
  /** Sensible starting setup for a typical plant of this species */
  starter: DeepPartial<ExperimentConfig>
  light: {
    /** Daily light integral (mol·m⁻²·d⁻¹) below which the plant declines quickly */
    dliMin: number
    /** Below this the plant roughly holds but does not grow */
    dliLow: number
    dliOptLow: number
    dliOptHigh: number
    /** Upper tolerable DLI before growth is suppressed */
    dliHigh: number
    /** Unfiltered direct PPFD above which leaf scorch becomes likely */
    scorchPpfd: number
  }
  temperature: {
    lethalMinC: number
    damageMinC: number
    growthMinC: number
    optLowC: number
    optHighC: number
    growthMaxC: number
    heatStressC: number
  }
  humidity: {
    stressBelowRh: number
    severeBelowRh: number
    optLowRh: number
    optHighRh: number
  }
  water: {
    /** Moisture fraction (of plant-available water) below which drought stress starts */
    droughtStartTheta: number
    /** Recommended moisture fraction at which to re-water */
    rewaterTheta: number
    /** Air-filled porosity the roots need to avoid hypoxia */
    airNeed: number
    /** 0–1, how well the plant rides out dry spells (water stored in leaves, stems or rhizomes) */
    droughtHardiness: number
  }
  medium: {
    airPorosityOpt: number
  }
  growth: {
    /** Days between new leaves in ideal conditions */
    leafIntervalDays: number
    leafExpansionDays: number
    juvenileLeafCm: number
    matureLeafCm: number
    maxLeaves: number
    /** ml of water transpired per m² leaf per day at reference conditions */
    transpirationMlPerM2: number
    /** Litres of root zone wanted per m² of leaf area */
    rootVolumeLPerM2: number
  }
  /** Transparent statement of where the numbers come from. */
  assumptions: string[]
  /** Published values this profile was set from, each traceable to a source. */
  evidence?: Evidence[]
}

export interface Evidence {
  /** What the value describes, e.g. "Minimum interior light" */
  field: string
  /** The value in the source's own units */
  value: string
  source: string
  url?: string
}

/* ---------- results ---------- */

export type FactorKey = 'light' | 'water' | 'humidity' | 'temperature' | 'medium'

export type StressKey =
  | 'lowLight'
  | 'scorch'
  | 'drought'
  | 'waterlogging'
  | 'rootRot'
  | 'dryAir'
  | 'cold'
  | 'heat'
  | 'nutrientDeficiency'
  | 'saltBuildup'
  | 'rootBound'

export interface LeafState {
  id: number
  bornDay: number
  /** 0–1, how unfurled / expanded the leaf is */
  expansion: number
  /** Blade length at full expansion, cm */
  sizeCm: number
  /** 0–1 amount of splitting / holes */
  fenestration: number
  /** 0–1 chlorosis of this leaf */
  yellow: number
  /** 0–1 necrosis (tips first) */
  brown: number
  seed: number
}

export interface DaySnapshot {
  day: number
  alive: boolean
  health: number
  leaves: LeafState[]
  /** Stem nodes produced so far (a dropped leaf leaves a bare node behind) */
  nodeCount: number
  leavesGrown: number
  leavesLost: number
  /** 1 = firm, 0 = fully wilted */
  turgor: number
  /** ≥1, petiole stretch from low light */
  etiolation: number
  /** 0–1 overall paleness */
  chlorosis: number
  rootHealth: number
  /** Root volume wanted / medium volume available */
  rootFill: number
  /** Plant-available water fraction; >1 means waterlogged */
  moisture: number
  /** 0–1 of reservoir capacity (semi-hydro only) */
  reservoir: number
  nutrients: number
  salts: number
  /** Relative growth rate, 0–1 of species optimum */
  growthRate: number
  waterUseMl: number
  watered: boolean
  fed: boolean
  env: {
    dli: number
    tMeanC: number
    tMinC: number
    tMaxC: number
    rh: number
    vpdKpa: number
  }
  factors: Record<FactorKey, number>
  stress: Record<StressKey, number>
}

export interface SimEvent {
  day: number
  kind: 'newLeaf' | 'leafLost' | 'stressStart' | 'death' | 'milestone'
  stress?: StressKey
  message: string
}

export interface StressSummary {
  key: StressKey
  label: string
  /** Mean intensity over the run, 0–1 */
  mean: number
  peak: number
  daysActive: number
  firstDay: number
}

export type Verdict =
  | 'Excellent growing potential'
  | 'Suitable conditions'
  | 'Suitable with adjustments'
  | 'High stress risk'
  | 'Unsuitable conditions'

export interface SimulationResult {
  durationDays: number
  snapshots: DaySnapshot[]
  events: SimEvent[]
  scores: Record<FactorKey, number>
  overall: number
  conditionsScore: number
  meanHealth: number
  verdict: Verdict
  limitingFactor: FactorKey
  stresses: StressSummary[]
  growth: {
    /** Mean relative growth rate, % of species optimum */
    potentialPct: number
    leavesGrown: number
    leavesLost: number
    finalLeafCount: number
    finalHealth: number
    survived: boolean
    daysToDeath: number | null
  }
  derived: {
    sunDli: number
    growDli: number
    totalDli: number
    potVolumeL: number
    mediumVolumeL: number
    availableWaterMl: number
    airPorosity: number
    meanWaterUseMl: number
    suggestedIntervalDays: number
    suggestedAmountMl: number
  }
}

export type DeepPartial<T> = T extends object
  ? T extends unknown[]
    ? T
    : { [K in keyof T]?: DeepPartial<T[K]> }
  : T

export interface Recommendation {
  id: string
  factor: FactorKey
  title: string
  detail: string
  /** Change in overall score if applied, from re-running the simulation. */
  scoreDelta: number
  newOverall: number
  patch: DeepPartial<ExperimentConfig>
}
