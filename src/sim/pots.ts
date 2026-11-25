import type { ExperimentConfig, PotMaterialId, PotShapeId } from './types'

export interface PotMaterial {
  id: PotMaterialId
  label: string
  description: string
  /** Multiplier on evaporation from the root zone (porous walls wick and evaporate). */
  evaporation: number
  /** Added air-filled porosity from breathable walls. */
  aerationBonus: number
  /** Fabric drains through its walls regardless of holes. */
  alwaysDrains: boolean
  defaultColor: string
  roughness: number
  metalness: number
  transparent: boolean
}

export const POT_MATERIALS: Record<PotMaterialId, PotMaterial> = {
  terracotta: {
    id: 'terracotta',
    label: 'Terracotta',
    description: 'Unglazed clay. Porous walls breathe and dry the mix faster.',
    evaporation: 1.4,
    aerationBonus: 0.03,
    alwaysDrains: false,
    defaultColor: '#b9673e',
    roughness: 0.95,
    metalness: 0,
    transparent: false,
  },
  ceramic: {
    id: 'ceramic',
    label: 'Glazed ceramic',
    description: 'Sealed walls. Holds moisture; relies on the drainage hole.',
    evaporation: 1,
    aerationBonus: 0,
    alwaysDrains: false,
    defaultColor: '#e8e3d8',
    roughness: 0.25,
    metalness: 0.05,
    transparent: false,
  },
  plastic: {
    id: 'plastic',
    label: 'Plastic',
    description: 'Light, non-porous nursery pot. Retains moisture longest.',
    evaporation: 0.95,
    aerationBonus: 0,
    alwaysDrains: false,
    defaultColor: '#2f3331',
    roughness: 0.55,
    metalness: 0,
    transparent: false,
  },
  concrete: {
    id: 'concrete',
    label: 'Concrete',
    description: 'Heavy and slightly porous. Dries a little faster than glazed pots.',
    evaporation: 1.12,
    aerationBonus: 0.01,
    alwaysDrains: false,
    defaultColor: '#a7a59f',
    roughness: 1,
    metalness: 0,
    transparent: false,
  },
  fabric: {
    id: 'fabric',
    label: 'Fabric grow bag',
    description: 'Breathable felt. Air-prunes roots, drains through the walls, dries fast.',
    evaporation: 1.6,
    aerationBonus: 0.06,
    alwaysDrains: true,
    defaultColor: '#3b3a37',
    roughness: 1,
    metalness: 0,
    transparent: false,
  },
  glass: {
    id: 'glass',
    label: 'Glass',
    description: 'Non-porous and see-through. Common for semi-hydro so the reservoir is visible.',
    evaporation: 0.95,
    aerationBonus: 0,
    alwaysDrains: false,
    defaultColor: '#dfeee9',
    roughness: 0.05,
    metalness: 0,
    transparent: true,
  },
}

export const POT_SHAPES: Record<PotShapeId, { id: PotShapeId; label: string }> = {
  tapered: { id: 'tapered', label: 'Tapered' },
  cylinder: { id: 'cylinder', label: 'Cylinder' },
  bowl: { id: 'bowl', label: 'Bowl' },
  square: { id: 'square', label: 'Square' },
}

/** Fraction of the bounding cylinder (π r² h) each shape actually encloses. */
const SHAPE_FILL: Record<PotShapeId, number> = {
  tapered: 0.76,
  cylinder: 1,
  bowl: 0.68,
  square: 4 / Math.PI,
}

/** Internal volume in litres from outer dimensions (walls ≈ 8 % of each dimension). */
export function potVolumeL(pot: Pick<ExperimentConfig['pot'], 'shape' | 'heightCm' | 'widthCm'>): number {
  const r = (pot.widthCm / 2) * 0.92
  const h = pot.heightCm * 0.94
  return (Math.PI * r * r * h * SHAPE_FILL[pot.shape]) / 1000
}

/** Fraction of pot volume filled with medium (headspace below the rim). */
export const MEDIUM_FILL = 0.88

/** Scale width and height together to hit a target volume. */
export function dimsForVolume(
  pot: Pick<ExperimentConfig['pot'], 'shape' | 'heightCm' | 'widthCm'>,
  targetL: number,
): { widthCm: number; heightCm: number } {
  const k = Math.cbrt(targetL / potVolumeL(pot))
  return {
    widthCm: Math.round(pot.widthCm * k * 10) / 10,
    heightCm: Math.round(pot.heightCm * k * 10) / 10,
  }
}

/** Open surface area of the medium, m². */
export function surfaceAreaM2(pot: Pick<ExperimentConfig['pot'], 'shape' | 'widthCm'>): number {
  const r = (pot.widthCm / 2) * 0.92 * 0.01
  return pot.shape === 'square' ? 4 * r * r : Math.PI * r * r
}

export function potDrains(pot: ExperimentConfig['pot']): boolean {
  return pot.drainageHoles || POT_MATERIALS[pot.material].alwaysDrains
}
