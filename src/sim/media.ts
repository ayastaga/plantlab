import type { MediumComponentId, MediumMix } from './types'

export interface MediumComponent {
  id: MediumComponentId
  label: string
  description: string
  /** Plant-available water held at container capacity, fraction of volume */
  waterHolding: number
  /** Air-filled porosity at container capacity, fraction of volume */
  airPorosity: number
  /** 0–1 how freely excess water leaves */
  drainage: number
  /** 0–1 ability to hold nutrients (CEC-like) */
  nutrientHolding: number
  /** 0–1 starter nutrient charge */
  nutrientCharge: number
  /** 0–1 capillary rise from a reservoir */
  wicking: number
  /** Visuals */
  color: string
  wetColor: string
  particle: { size: number; round: boolean; density: number }
}

/**
 * Approximate physical properties of common container substrates. Real values
 * vary a lot by product and particle size; these are representative relative
 * figures used as transparent model inputs.
 */
export const MEDIA: Record<MediumComponentId, MediumComponent> = {
  pottingSoil: {
    id: 'pottingSoil',
    label: 'Potting soil',
    description: 'Peat-based all-purpose mix. Holds lots of water, little air when wet.',
    waterHolding: 0.42,
    airPorosity: 0.1,
    drainage: 0.35,
    nutrientHolding: 0.75,
    nutrientCharge: 0.8,
    wicking: 0.85,
    color: '#4a3526',
    wetColor: '#241710',
    particle: { size: 0.0035, round: false, density: 1 },
  },
  perlite: {
    id: 'perlite',
    label: 'Perlite',
    description: 'Expanded volcanic glass. Adds air space and drainage, no nutrients.',
    waterHolding: 0.18,
    airPorosity: 0.35,
    drainage: 0.9,
    nutrientHolding: 0.05,
    nutrientCharge: 0,
    wicking: 0.6,
    color: '#ece8df',
    wetColor: '#d8d3c8',
    particle: { size: 0.0045, round: true, density: 1 },
  },
  pumice: {
    id: 'pumice',
    label: 'Pumice',
    description: 'Porous volcanic rock. Heavy, stable aeration, drains fast.',
    waterHolding: 0.16,
    airPorosity: 0.33,
    drainage: 0.9,
    nutrientHolding: 0.1,
    nutrientCharge: 0,
    wicking: 0.55,
    color: '#a9a498',
    wetColor: '#7f7b70',
    particle: { size: 0.006, round: false, density: 0.9 },
  },
  orchidBark: {
    id: 'orchidBark',
    label: 'Orchid bark',
    description: 'Chunky fir or pine bark. Large air gaps aroid roots like.',
    waterHolding: 0.14,
    airPorosity: 0.4,
    drainage: 0.95,
    nutrientHolding: 0.3,
    nutrientCharge: 0.1,
    wicking: 0.3,
    color: '#7a5233',
    wetColor: '#4b2f1c',
    particle: { size: 0.011, round: false, density: 0.6 },
  },
  cocoCoir: {
    id: 'cocoCoir',
    label: 'Coco coir',
    description: 'Coconut fibre. Water-retentive but re-wets easily and stays airier than peat.',
    waterHolding: 0.45,
    airPorosity: 0.2,
    drainage: 0.5,
    nutrientHolding: 0.5,
    nutrientCharge: 0.1,
    wicking: 0.9,
    color: '#6b4a2e',
    wetColor: '#3d2917',
    particle: { size: 0.004, round: false, density: 1 },
  },
  leca: {
    id: 'leca',
    label: 'LECA',
    description: 'Expanded clay balls. Inert; used with a water reservoir and nutrient solution.',
    waterHolding: 0.1,
    airPorosity: 0.45,
    drainage: 1,
    nutrientHolding: 0.02,
    nutrientCharge: 0,
    wicking: 0.8,
    color: '#a5633f',
    wetColor: '#7c4429',
    particle: { size: 0.0115, round: true, density: 1 },
  },
  cactusMix: {
    id: 'cactusMix',
    label: 'Cactus mix',
    description: 'Gritty, sandy commercial mix. Dries quickly, modest nutrients.',
    waterHolding: 0.24,
    airPorosity: 0.26,
    drainage: 0.8,
    nutrientHolding: 0.3,
    nutrientCharge: 0.3,
    wicking: 0.6,
    color: '#8a7355',
    wetColor: '#5a4a35',
    particle: { size: 0.004, round: false, density: 1 },
  },
}

export const MEDIUM_IDS = Object.keys(MEDIA) as MediumComponentId[]

export interface MediumPreset {
  id: string
  label: string
  note: string
  mix: MediumMix
  semiHydro: boolean
}

export function emptyMix(): MediumMix {
  return { pottingSoil: 0, perlite: 0, pumice: 0, orchidBark: 0, cocoCoir: 0, leca: 0, cactusMix: 0 }
}

const mix = (m: Partial<MediumMix>): MediumMix => ({ ...emptyMix(), ...m })

export const MEDIUM_PRESETS: MediumPreset[] = [
  {
    id: 'potting',
    label: 'Standard potting soil',
    note: '100 % all-purpose mix',
    mix: mix({ pottingSoil: 100 }),
    semiHydro: false,
  },
  {
    id: 'aroid',
    label: 'Chunky aroid mix',
    note: '40 soil · 30 perlite · 20 bark · 10 coir',
    mix: mix({ pottingSoil: 40, perlite: 30, orchidBark: 20, cocoCoir: 10 }),
    semiHydro: false,
  },
  {
    id: 'cactus',
    label: 'Cactus mix',
    note: '100 % gritty mix',
    mix: mix({ cactusMix: 100 }),
    semiHydro: false,
  },
  {
    id: 'coir-perlite',
    label: 'Coir + perlite',
    note: '60 coir · 40 perlite',
    mix: mix({ cocoCoir: 60, perlite: 40 }),
    semiHydro: false,
  },
  {
    id: 'leca',
    label: 'LECA semi-hydro',
    note: '100 % LECA with reservoir',
    mix: mix({ leca: 100 }),
    semiHydro: true,
  },
  {
    id: 'pon',
    label: 'Mineral semi-hydro',
    note: '60 pumice · 40 LECA with reservoir',
    mix: mix({ pumice: 60, leca: 40 }),
    semiHydro: true,
  },
]

export interface MixProperties {
  waterHolding: number
  airPorosity: number
  drainage: number
  nutrientHolding: number
  nutrientCharge: number
  wicking: number
}

export function mixTotal(m: MediumMix): number {
  return MEDIUM_IDS.reduce((s, id) => s + (m[id] || 0), 0)
}

/** Volume-weighted blend. Normalises, so a mix that does not sum to 100 still works. */
export function mixProperties(m: MediumMix): MixProperties {
  const total = mixTotal(m) || 1
  const out: MixProperties = {
    waterHolding: 0,
    airPorosity: 0,
    drainage: 0,
    nutrientHolding: 0,
    nutrientCharge: 0,
    wicking: 0,
  }
  for (const id of MEDIUM_IDS) {
    const f = (m[id] || 0) / total
    if (!f) continue
    const c = MEDIA[id]
    out.waterHolding += c.waterHolding * f
    out.airPorosity += c.airPorosity * f
    out.drainage += c.drainage * f
    out.nutrientHolding += c.nutrientHolding * f
    out.nutrientCharge += c.nutrientCharge * f
    out.wicking += c.wicking * f
  }
  return out
}

/** Scale the other components so the mix totals 100 after `id` is set to `value`. */
export function setMixComponent(m: MediumMix, id: MediumComponentId, value: number): MediumMix {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const next = { ...m, [id]: v }
  const others = MEDIUM_IDS.filter((k) => k !== id)
  const otherSum = others.reduce((s, k) => s + m[k], 0)
  const remaining = 100 - v
  if (otherSum <= 0) {
    // nothing else to scale: put the remainder in the first sensible filler
    const filler = id === 'perlite' ? 'pottingSoil' : 'perlite'
    for (const k of others) next[k] = 0
    next[filler] = remaining
    return next
  }
  let acc = 0
  let largest: MediumComponentId = others[0]
  for (const k of others) {
    next[k] = Math.round((m[k] / otherSum) * remaining)
    acc += next[k]
    if (next[k] > next[largest]) largest = k
  }
  next[largest] += remaining - acc
  return next
}

export function matchPreset(m: MediumMix, semiHydro: boolean): MediumPreset | null {
  return (
    MEDIUM_PRESETS.find(
      (p) => p.semiHydro === semiHydro && MEDIUM_IDS.every((id) => p.mix[id] === (m[id] || 0)),
    ) ?? null
  )
}

export function describeMix(m: MediumMix): string {
  return MEDIUM_IDS.filter((id) => m[id] > 0)
    .sort((a, b) => m[b] - m[a])
    .map((id) => `${m[id]}% ${MEDIA[id].label.toLowerCase()}`)
    .join(', ')
}
