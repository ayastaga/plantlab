import * as THREE from 'three'
import type { LeafShape } from '../sim/types'

/** Small deterministic PRNG so every leaf keeps its shape between renders. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const curve = (pts: [number, number][]) => new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)))

/**
 * Right-hand margin of the blade for each leaf shape, attachment at the
 * origin, tip at +Y, half-width normalised to about 0.5 (scaled by the
 * species' width/length aspect when built).
 */
const MARGINS: Record<LeafShape, THREE.SplineCurve> = {
  cordate: curve([[0, 0], [0.09, -0.1], [0.26, -0.16], [0.43, -0.07], [0.52, 0.17], [0.5, 0.42], [0.4, 0.66], [0.24, 0.86], [0.09, 0.97], [0, 1.02]]),
  ovate: curve([[0, 0], [0.14, 0.01], [0.33, 0.1], [0.47, 0.28], [0.5, 0.46], [0.42, 0.68], [0.26, 0.86], [0.09, 0.97], [0, 1.02]]),
  lanceolate: curve([[0, 0], [0.16, 0.05], [0.38, 0.2], [0.5, 0.38], [0.46, 0.58], [0.31, 0.78], [0.14, 0.93], [0.04, 0.99], [0, 1.02]]),
  strap: curve([[0, 0], [0.3, 0.015], [0.46, 0.08], [0.5, 0.25], [0.5, 0.6], [0.42, 0.8], [0.24, 0.93], [0.08, 0.99], [0, 1.02]]),
  round: curve([[0, 0], [0.18, -0.03], [0.4, 0.06], [0.52, 0.28], [0.5, 0.52], [0.38, 0.76], [0.2, 0.92], [0.07, 0.99], [0, 1.02]]),
}

// deliberately coarse: the look is faceted low-poly, not botanical illustration
const MARGIN_SAMPLES = 14
const MIDRIB_SAMPLES = 5
export const LEAF_TIP_Y = 1.02

interface Half {
  contour: THREE.Vector2[]
  /** 1 on the midrib, 0 on the margin, per contour vertex */
  edge: number[]
  holes: THREE.Vector2[][]
}

function buildHalf(rand: () => number, fenestration: number, MARGIN: THREE.SplineCurve): Half {
  const slitCount = Math.round(fenestration * 5 + rand() * 0.6 - 0.3)
  const slits: { t: number; hw: number; q: THREE.Vector2 }[] = []
  for (let i = 0; i < slitCount; i++) {
    const t = 0.3 + ((i + 0.5 + (rand() - 0.5) * 0.35) / Math.max(1, slitCount)) * 0.56
    const p = MARGIN.getPoint(t)
    const depth = Math.min(0.82, 0.5 + 0.3 * fenestration + (rand() - 0.5) * 0.12)
    // slits follow the lateral veins: inward and back toward the base
    const target = new THREE.Vector2(0.04, p.y - 0.13 - 0.08 * (1 - t))
    const q = p.clone().lerp(target, depth)
    q.x = Math.max(q.x, 0.15)
    slits.push({ t, hw: 0.022 + rand() * 0.006, q })
  }

  const contour: THREE.Vector2[] = []
  const edge: number[] = []
  const push = (v: THREE.Vector2, e: number) => {
    contour.push(v)
    edge.push(e)
  }

  let slitIndex = 0
  for (let i = 0; i <= MARGIN_SAMPLES; i++) {
    const t = i / MARGIN_SAMPLES
    const s = slits[slitIndex]
    if (s && t > s.t - s.hw) {
      if (t < s.t + s.hw) continue
      // cut the slit: margin → rounded inner end → margin
      const a = MARGIN.getPoint(s.t - s.hw)
      const b = MARGIN.getPoint(s.t + s.hw)
      const along = b.clone().sub(a).normalize().multiplyScalar(0.016)
      push(a, 0)
      push(s.q.clone().sub(along), 0)
      push(s.q.clone().add(along.clone().multiplyScalar(0.2)).add(new THREE.Vector2(-0.012, -0.004)), 0)
      push(s.q.clone().add(along), 0)
      push(b, 0)
      slitIndex++
    }
    const p = MARGIN.getPoint(t)
    // the first and last points sit on the midrib
    push(p, i === 0 || i === MARGIN_SAMPLES ? 1 : 0)
  }
  for (let i = 1; i < MIDRIB_SAMPLES; i++) {
    push(new THREE.Vector2(0, LEAF_TIP_Y * (1 - i / MIDRIB_SAMPLES)), 1)
  }

  // inner fenestrae: oval holes beside the midrib on mature leaves
  const holes: THREE.Vector2[][] = []
  if (fenestration > 0.5) {
    const count = Math.round((fenestration - 0.4) * 5)
    for (let i = 0; i < count; i++) {
      const cy = 0.2 + ((i + 0.5) / count) * 0.5 + (rand() - 0.5) * 0.04
      const cx = 0.075 + rand() * 0.02
      const rx = 0.02 + rand() * 0.012
      const ry = 0.034 + rand() * 0.02
      const tooClose = slits.some((s) => Math.abs(s.q.y - cy) < ry + 0.03 && s.q.x < cx + rx + 0.035)
      if (tooClose) continue
      const hole: THREE.Vector2[] = []
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        hole.push(new THREE.Vector2(cx + Math.cos(a) * rx + Math.sin(a) * 0.006, cy + Math.sin(a) * ry))
      }
      holes.push(hole)
    }
  }
  return { contour, edge, holes }
}

/**
 * Build one Monstera blade. Unit length (tip at y ≈ 1), lying in the XY plane
 * with +Z as the upper surface, attached at the origin.
 *
 * `curl` (0–1) rolls the margins down, used for unfurling and wilting leaves.
 */
export function buildLeafGeometry(
  seed: number,
  fenestration: number,
  curl: number,
  shape: LeafShape = 'cordate',
  aspect = 1,
  stiffness = 0.3,
): THREE.BufferGeometry {
  const rand = mulberry32(seed * 7919 + 13)
  const positions: number[] = []
  const uvs: number[] = []
  const edges: number[] = []
  const indices: number[] = []
  const wavePhase = rand() * 6.28
  const asym = 0.94 + rand() * 0.12
  // long narrow leaves arch along their length unless they are rigid
  const long = shape === 'strap' || shape === 'lanceolate'
  const arch = (0.28 + rand() * 0.14) * (long ? THREE.MathUtils.lerp(2.3, 0.1, stiffness) : 1 - 0.55 * stiffness)

  for (const side of [1, -1]) {
    const half = buildHalf(rand, fenestration, MARGINS[shape])
    const widthScale = side === 1 ? asym : 2 - asym
    const all = [...half.contour, ...half.holes.flat()]
    const allEdge = [...half.edge, ...half.holes.flat().map(() => 0.75)]
    const tris = THREE.ShapeUtils.triangulateShape(half.contour, half.holes)
    const base = positions.length / 3
    for (let i = 0; i < all.length; i++) {
      const x = all[i].x * side * widthScale
      const y = all[i].y
      const ax = Math.abs(x)
      // cross-section keeps its form whatever the width: shallow V, margins roll down
      let z = (0.16 * ax - (0.42 + 1.6 * curl) * ax * ax) * Math.max(0.35, aspect)
      z -= arch * Math.max(0, y - 0.25) ** 2 * 0.55 // blade arches toward the tip
      z -= 0.1 * Math.max(0, -y) * 2 // basal lobes dip a little
      z += Math.sin(y * 13 + wavePhase + side) * 0.012 * (ax / 0.5) * (1 - 0.7 * stiffness) // gentle ripple
      positions.push(x * aspect * (1 - 0.22 * curl), y, z)
      uvs.push(x / 1.2 + 0.5, (y + 0.2) / 1.26)
      edges.push(allEdge[i])
    }
    for (const tri of tris) {
      if (side === 1) indices.push(base + tri[0], base + tri[1], base + tri[2])
      else indices.push(base + tri[0], base + tri[2], base + tri[1])
    }
  }

  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  indexed.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  indexed.setAttribute('edge', new THREE.Float32BufferAttribute(edges, 1))
  indexed.setIndex(indices)
  // unshared vertices give every triangle its own normal and its own colour: hard facets
  const g = indexed.toNonIndexed()
  indexed.dispose()
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3), 3))
  g.computeVertexNormals()
  return g
}

const cHealthyOld = new THREE.Color()
const cHealthyNew = new THREE.Color()
const cEdge = new THREE.Color()
const cPale = new THREE.Color('#a6bd5c')
const cYellow = new THREE.Color('#cdb53c')
const cBrown = new THREE.Color('#6e4b2a')
const cCrisp = new THREE.Color('#4d3520')
const tmp = new THREE.Color()
const base = new THREE.Color()

export interface LeafTint {
  /** 0 = just emerged, 1 = mature */
  maturity: number
  yellow: number
  brown: number
  chlorosis: number
  color: string
  newColor: string
  edgeColor: string | null
}

/** Write per-vertex colours: whole-blade tone, with necrosis creeping in from the margin and tip. */
export function paintLeaf(g: THREE.BufferGeometry, tint: LeafTint) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const edge = g.getAttribute('edge') as THREE.BufferAttribute
  const col = g.getAttribute('color') as THREE.BufferAttribute
  cHealthyOld.set(tint.color)
  cHealthyNew.set(tint.newColor)
  if (tint.edgeColor) cEdge.set(tint.edgeColor)
  base.copy(cHealthyNew).lerp(cHealthyOld, tint.maturity)
  base.lerp(cPale, tint.chlorosis * 0.85)
  base.lerp(cYellow, Math.min(1, tint.yellow * 1.25))
  if (tint.yellow > 0.75) base.lerp(cBrown, (tint.yellow - 0.75) * 2.4)
  for (let i = 0; i < pos.count; i++) {
    // one flat colour per triangle, taken at its centroid
    const t0 = i - (i % 3)
    const e = (edge.getX(t0) + edge.getX(t0 + 1) + edge.getX(t0 + 2)) / 3
    const y = (pos.getY(t0) + pos.getY(t0 + 1) + pos.getY(t0 + 2)) / 3
    const necrosis = Math.min(1, Math.max(0, tint.brown * 2.6 - e * 1.25 + (y - 0.45) * 0.5 * tint.brown))
    tmp.copy(base)
    // variegated margin, fading as the leaf yellows
    if (tint.edgeColor && e < 0.35) tmp.lerp(cEdge, (1 - e / 0.35) * 0.6 * (1 - tint.yellow))
    tmp.lerp(cBrown, Math.min(1, necrosis * 1.4))
    if (necrosis > 0.7) tmp.lerp(cCrisp, (necrosis - 0.7) * 2)
    // small per-facet value shifts, like hand-placed colour blocks
    tmp.offsetHSL(0, 0, (((t0 * 2654435761) >>> 0) % 1000) / 1000 * 0.07 - 0.035)
    col.setXYZ(i, tmp.r, tmp.g, tmp.b)
  }
  col.needsUpdate = true
}

let veinTexture: THREE.CanvasTexture | null = null

/** Greyscale vein map multiplied over the vertex colours. Generated once, no image assets. */
export function getVeinTexture(): THREE.CanvasTexture {
  if (veinTexture) return veinTexture
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const toPx = (x: number, y: number): [number, number] => [(x / 1.2 + 0.5) * size, (1 - (y + 0.2) / 1.26) * size]

  ctx.fillStyle = '#d2d2d2'
  ctx.fillRect(0, 0, size, size)
  // soft mottling so the surface is not flat
  const rand = mulberry32(42)
  for (let i = 0; i < 900; i++) {
    const r = 6 + rand() * 26
    const shade = 195 + Math.floor(rand() * 40)
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.07)`
    ctx.beginPath()
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineCap = 'round'
  const vein = (pts: [number, number][], width: number, alpha: number) => {
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`
    ctx.lineWidth = width
    ctx.beginPath()
    pts.forEach(([x, y], i) => {
      const [px, py] = toPx(x, y)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  }
  vein([[0, 0], [0, 1.02]], 7, 0.9)
  for (const side of [1, -1]) {
    for (let i = 0; i < 11; i++) {
      const y0 = 0.02 + i * 0.085
      const reach = 0.56 * Math.sin(Math.min(1, (y0 + 0.25) / 0.6) * Math.PI * 0.5) * (1 - Math.max(0, y0 - 0.45) * 1.1)
      const pts: [number, number][] = []
      for (let k = 0; k <= 10; k++) {
        const u = k / 10
        pts.push([side * reach * u, y0 + 0.2 * u * u * (i < 2 ? -1.3 : 1) + (i < 2 ? -0.06 * u : 0.04 * u)])
      }
      vein(pts, 2.6, 0.5)
      // secondary veins between the main laterals
      const pts2: [number, number][] = pts.map(([x, y]) => [x * 0.8, y + 0.042])
      vein(pts2, 1.1, 0.22)
    }
  }
  veinTexture = new THREE.CanvasTexture(canvas)
  veinTexture.colorSpace = THREE.SRGBColorSpace
  veinTexture.anisotropy = 8
  return veinTexture
}
