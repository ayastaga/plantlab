import * as THREE from 'three'
import type { ExperimentConfig, PotShapeId } from '../sim/types'

export const SELECT_COLOR = '#e8a93a'

/** Approximate blackbody colour for a correlated colour temperature (Kelvin). */
export function kelvinToColor(k: number): THREE.Color {
  const t = Math.min(40000, Math.max(1000, k)) / 100
  let r: number, g: number, b: number
  if (t <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(t) - 161.1195681661
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492)
    b = 255
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace)
}

export function kelvinToCss(k: number): string {
  return `#${kelvinToColor(k).getHexString()}`
}

/** Unit vector toward the sun. Azimuth is measured clockwise from +Z when seen from above. */
export function sunDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg)
  const el = THREE.MathUtils.degToRad(elevationDeg)
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
}

/**
 * Visual brightness for a PPFD value. Compressed on purpose: the renderer
 * cannot show a 100× range, so the viewport is an impression of the light, and
 * the PPFD/DLI numbers are the measurement.
 */
export function visualLight(ppfd: number): number {
  return Math.pow(Math.min(1, Math.max(0, ppfd) / 1500), 0.45)
}

/* ---------- pot profile, shared by the pot shell and the medium inside it ---------- */

export interface PotDims {
  /** metres */
  height: number
  radius: number
  wall: number
  shape: PotShapeId
  segments: number
  /** rotation so a 4-sided lathe sits square to the axes */
  twist: number
  /** height of the medium surface */
  fillY: number
}

export function potDims(pot: ExperimentConfig['pot']): PotDims {
  const square = pot.shape === 'square'
  const radius = (pot.widthCm / 200) * (square ? Math.SQRT2 : 1)
  const height = pot.heightCm / 100
  return {
    height,
    radius,
    wall: Math.max(0.004, (pot.widthCm / 100) * 0.035),
    shape: pot.shape,
    // ten flat sides, like a hand-modelled pot
    segments: square ? 4 : 10,
    twist: square ? Math.PI / 4 : 0,
    fillY: height * 0.9,
  }
}

/** Outer radius of the pot wall at a height fraction t (0 = base, 1 = rim). */
export function potRadiusAt(d: PotDims, t: number): number {
  switch (d.shape) {
    case 'tapered':
      return d.radius * (0.68 + 0.32 * t)
    case 'bowl':
      return d.radius * (0.5 + 0.5 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5) ** 0.75)
    case 'square':
      return d.radius * (0.9 + 0.1 * t)
    default:
      return d.radius
  }
}

/** Inner radius at the medium surface (as an inscribed circle for square pots). */
export function mediumRadius(d: PotDims): number {
  const r = potRadiusAt(d, d.fillY / d.height) - d.wall
  return d.shape === 'square' ? r / Math.SQRT2 : r
}

export function hexLerp(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t)
}
