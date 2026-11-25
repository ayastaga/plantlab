import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { getSpecies } from '../sim/species'
import type { DaySnapshot, LeafState, SpeciesProfile } from '../sim/types'
import { useHidden, useLab, useSelected, useSnapshot } from '../store/useLab'
import { buildLeafGeometry, mulberry32, paintLeaf } from './leafGeometry'
import { SELECT_COLOR, mediumRadius, potDims, type PotDims } from './util'

const UP = new THREE.Vector3(0, 1, 0)
const rad = THREE.MathUtils.degToRad
const lerp = THREE.MathUtils.lerp
const smoothstep = THREE.MathUtils.smoothstep

interface LeafPlacement {
  leaf: LeafState
  node: THREE.Vector3
  control: THREE.Vector3
  end: THREE.Vector3
  matrix: THREE.Matrix4
  petioleRadius: number
  hasPetiole: boolean
  curl: number
  maturity: number
}

interface Layout {
  leaves: LeafPlacement[]
  /** One or more stem paths (several for trailing vines) */
  stems: THREE.Vector3[][]
  stemRadius: number
}

interface Ctx {
  snap: DaySnapshot
  sp: SpeciesProfile
  sunAz: number
  dims: PotDims
}

function blade(end: THREE.Vector3, out: THREE.Vector3, pitchDeg: number, roll: number, size: number): THREE.Matrix4 {
  // local +Y runs along the midrib, +Z is the upper surface; pitch is the angle of the midrib below horizontal
  const p = rad(pitchDeg)
  const yAxis = out.clone().multiplyScalar(Math.cos(p)).addScaledVector(UP, -Math.sin(p)).normalize()
  const zAxis = UP.clone().multiplyScalar(Math.cos(p)).addScaledVector(out, Math.sin(p)).normalize()
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize()
  return new THREE.Matrix4()
    .makeTranslation(end.x, end.y, end.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(yAxis, roll))
    .multiply(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis))
    .multiply(new THREE.Matrix4().makeScale(size, size, size))
}

/** Shared per-leaf quantities, all taken from the simulation snapshot. */
function leafBasics(c: Ctx, leaf: LeafState, rank: number) {
  const n = c.snap.leaves.length
  const rand = mulberry32(leaf.seed)
  const age = n > 1 ? 1 - rank / (n - 1) : 0
  const open = smoothstep(leaf.expansion, 0.15, 0.9)
  const size = (leaf.sizeCm / 100) * lerp(0.22, 1, leaf.expansion)
  const wilt = (1 - c.snap.turgor) * (1 - 0.6 * c.sp.leaf.stiffness)
  // spiral phyllotaxis, pulled part of the way toward the light
  let phi = leaf.id * rad(137.5) + (rand() - 0.5) * 0.5
  const sunPhi = Math.atan2(Math.cos(c.sunAz), Math.sin(c.sunAz))
  phi += 0.3 * Math.sin(sunPhi - phi)
  const out = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi))
  const curl = Math.min(1, (1 - open) * 0.9 + wilt * 0.45 + leaf.brown * 0.5)
  const maturity = smoothstep(leaf.expansion, 0.3, 1) * (0.55 + 0.45 * age)
  const petiole = c.sp.leaf.petioleRatio * (leaf.sizeCm / 100) * c.snap.etiolation * Math.pow(leaf.expansion, 0.8) * (0.9 + rand() * 0.2)
  return { rand, age, open, size, wilt, phi, out, curl, maturity, petiole }
}

function place(
  leaf: LeafState,
  b: ReturnType<typeof leafBasics>,
  node: THREE.Vector3,
  elevationDeg: number,
  pitchDeg: number,
  sp: SpeciesProfile,
): LeafPlacement {
  const el = rad(elevationDeg)
  const length = Math.max(0.001, b.petiole)
  const end = node.clone().addScaledVector(b.out, Math.cos(el) * length).addScaledVector(UP, Math.sin(el) * length)
  // petioles leave upward and arch out; a wilted one sags instead
  const lift = Math.max(0.12, Math.sin(el) + 0.3) * 0.62 * length * (1 - 0.5 * b.wilt)
  const control = node.clone().addScaledVector(UP, lift).addScaledVector(b.out, 0.14 * length)
  return {
    leaf,
    node,
    control,
    end,
    matrix: blade(end, b.out, pitchDeg, (b.rand() - 0.5) * 0.45 * (1 - sp.leaf.stiffness), b.size),
    petioleRadius: 0.0026 + (leaf.sizeCm / 100) * 0.011 * (0.5 + 0.5 * leaf.expansion) * Math.min(1, 0.4 + sp.leaf.aspect),
    hasPetiole: sp.leaf.petioleRatio > 0.04,
    curl: b.curl,
    maturity: b.maturity,
  }
}

/** Climbers and canes: leaves spiral up a central stem. Canes just have longer internodes and short petioles. */
function uprightLayout(c: Ctx): Layout {
  const { snap, sp } = c
  const lean = new THREE.Vector3(Math.sin(c.sunAz), 0, Math.cos(c.sunAz)).multiplyScalar(sp.habit === 'cane' ? 0.12 : 0.35)
  const internode = (sp.leaf.internodeCm / 100) * (0.75 + 0.25 * snap.etiolation)
  const stemPoint = (i: number) => {
    const y = 0.015 + i * internode
    return new THREE.Vector3(lean.x * y * y * 1.6 + Math.sin(i * 1.7) * 0.004, y, lean.z * y * y * 1.6 + Math.cos(i * 2.3) * 0.004)
  }
  const nodeCount = Math.max(1, snap.nodeCount, ...snap.leaves.map((l) => l.id + 1))
  const cane = sp.habit === 'cane'
  const leaves = snap.leaves.map((leaf, rank) => {
    const b = leafBasics(c, leaf, rank)
    let elevation = (cane ? lerp(55, 20, Math.pow(b.age, 0.8)) : lerp(74, 30, Math.pow(b.age, 0.8))) + (b.rand() - 0.5) * 10
    elevation = Math.max(-38, elevation - (b.wilt * 42 + leaf.yellow * 26 + leaf.brown * 14))
    let pitch = (cane ? lerp(-25, 30, b.age) : lerp(18, 52, b.age)) + b.wilt * 38 + leaf.yellow * 18 + (b.rand() - 0.5) * 12
    pitch = lerp(-68, Math.min(86, pitch), b.open)
    return place(leaf, b, stemPoint(leaf.id), elevation, pitch, sp)
  })
  const stem: THREE.Vector3[] = [new THREE.Vector3(0, -0.02, 0)]
  for (let i = 0; i <= nodeCount; i++) stem.push(stemPoint(i))
  return { leaves, stems: [stem], stemRadius: (cane ? 0.008 : 0.0105) + Math.min(0.008, nodeCount * (cane ? 0.0006 : 0.0004)) }
}

/** Rosettes: leaves rise from the base. Stiff leaves stand, soft ones arch outward. */
function rosetteLayout(c: Ctx): Layout {
  const { snap, sp } = c
  const stiff = sp.leaf.stiffness
  const leaves = snap.leaves.map((leaf, rank) => {
    const b = leafBasics(c, leaf, rank)
    const node = new THREE.Vector3(Math.cos(b.phi) * 0.006 * (1 + b.age * 2), 0.004 + (1 - b.age) * 0.006, Math.sin(b.phi) * 0.006 * (1 + b.age * 2))
    // old leaves splay outward, new ones stand in the centre
    const stand = lerp(lerp(78, 30, Math.pow(b.age, 0.7)), lerp(86, 66, b.age), stiff) + (b.rand() - 0.5) * 8
    const elevation = Math.max(-10, stand - b.wilt * 45 - leaf.yellow * 22)
    // the blade continues the line of its stalk, then sags by an amount set by softness and thirst
    let pitch = -elevation + (1 - stiff) * (14 + 16 * b.age) + b.wilt * 30 + leaf.yellow * 15
    pitch = lerp(-80, Math.min(80, pitch), b.open)
    return place(leaf, b, node, elevation, pitch, sp)
  })
  return { leaves, stems: [[new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0, 0.012, 0)]], stemRadius: 0.012 }
}

/** Trailing vines: several stems run to the rim and hang down, leaves along each. */
function trailingLayout(c: Ctx): Layout {
  const { snap, sp, dims } = c
  const rim = mediumRadius(dims) + dims.wall + 0.012
  const floor = -dims.fillY + 0.012
  const vines = Math.max(3, Math.min(6, Math.round(snap.nodeCount / 5)))
  const spacing = (sp.leaf.internodeCm / 100) * (0.8 + 0.2 * snap.etiolation)
  const vinePoint = (v: number, s: number) => {
    const a = (v / vines) * Math.PI * 2 + 0.5
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    if (s <= rim) return dir.clone().multiplyScalar(s).setY(0.012 + 0.03 * Math.sin((Math.PI * s) / rim))
    const drop = s - rim
    const y = Math.max(floor, -drop)
    // once a vine reaches the floor it runs along it
    const along = rim + 0.03 * (1 - Math.exp(-drop * 8)) + Math.max(0, drop + floor)
    return dir.clone().multiplyScalar(along).setY(y + 0.012)
  }
  const perVine: number[] = Array(vines).fill(0)
  const leaves = snap.leaves.map((leaf, rank) => {
    const b = leafBasics(c, leaf, rank)
    const v = leaf.id % vines
    const k = Math.floor(leaf.id / vines)
    perVine[v] = Math.max(perVine[v], k + 1)
    // the oldest leaf on each vine sits furthest along it
    const maxK = Math.floor((snap.nodeCount - 1 - v) / vines)
    const s = 0.03 + (maxK - k) * spacing
    const node = vinePoint(v, s)
    const a = (v / vines) * Math.PI * 2 + 0.5 + (k % 2 ? 0.9 : -0.9)
    b.out.set(Math.cos(a), 0, Math.sin(a))
    const hanging = s > rim
    const elevation = (hanging ? 5 : 40) - b.wilt * 35 + (b.rand() - 0.5) * 20
    let pitch = (hanging ? 55 : 25) + b.wilt * 25 + leaf.yellow * 15 + (b.rand() - 0.5) * 14
    pitch = lerp(-40, Math.min(86, pitch), b.open)
    return place(leaf, b, node, elevation, pitch, sp)
  })
  const stems: THREE.Vector3[][] = []
  for (let v = 0; v < vines; v++) {
    const maxK = Math.floor((snap.nodeCount - 1 - v) / vines)
    if (maxK < 0) continue
    const length = 0.03 + maxK * spacing + 0.02
    const pts: THREE.Vector3[] = [new THREE.Vector3(0, -0.02, 0)]
    for (let s = 0; s <= length; s += 0.02) pts.push(vinePoint(v, s))
    pts.push(vinePoint(v, length))
    stems.push(pts)
  }
  return { leaves, stems, stemRadius: 0.0032 }
}

function layout(c: Ctx): Layout {
  if (c.sp.habit === 'rosette') return rosetteLayout(c)
  if (c.sp.habit === 'trailing') return trailingLayout(c)
  return uprightLayout(c)
}

function Leaf({ p, sp, chlorosis, material }: { p: LeafPlacement; sp: SpeciesProfile; chlorosis: number; material: THREE.Material }) {
  // shape depends on a few quantised parameters, so scrubbing the timeline rarely rebuilds it
  const fenQ = Math.round(p.leaf.fenestration * 12) / 12
  const curlQ = Math.round(p.curl * 8) / 8
  const f = sp.leaf
  const geometry = useMemo(() => buildLeafGeometry(p.leaf.seed, fenQ, curlQ, f.shape, f.aspect, f.stiffness), [p.leaf.seed, fenQ, curlQ, f.shape, f.aspect, f.stiffness])
  useEffect(() => () => geometry.dispose(), [geometry])
  const yellowQ = Math.round(p.leaf.yellow * 40) / 40
  const brownQ = Math.round(p.leaf.brown * 40) / 40
  const paleQ = Math.round(chlorosis * 20) / 20
  const matQ = Math.round(p.maturity * 20) / 20
  useMemo(
    () => paintLeaf(geometry, { maturity: matQ, yellow: yellowQ, brown: brownQ, chlorosis: paleQ, color: f.color, newColor: f.newColor, edgeColor: f.edgeColor }),
    [geometry, matQ, yellowQ, brownQ, paleQ, f.color, f.newColor, f.edgeColor],
  )
  return <mesh geometry={geometry} material={material} matrix={p.matrix} matrixAutoUpdate={false} castShadow receiveShadow />
}

function Tube({ points, radius, material, segments }: { points: THREE.Vector3[]; radius: number; material: THREE.Material; segments?: number }) {
  const geometry = useMemo(() => {
    const curve = points.length === 3 ? new THREE.QuadraticBezierCurve3(points[0], points[1], points[2]) : new THREE.CatmullRomCurve3(points)
    return new THREE.TubeGeometry(curve, Math.min(segments ?? 99, Math.max(4, points.length * 2)), radius, 5, false)
  }, [points, radius, segments])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} castShadow />
}

function Roots({ snap, radius, depth }: { snap: DaySnapshot; radius: number; depth: number }) {
  const selected = useSelected('roots')
  const geometries = useMemo(() => {
    const rand = mulberry32(991)
    const spread = Math.min(1, 0.35 + snap.rootFill * 0.75)
    const count = Math.round(6 + Math.min(1.4, snap.rootFill) * 14)
    const out: THREE.TubeGeometry[] = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.8
      const r = radius * 0.88 * spread * (0.45 + rand() * 0.55)
      const d = depth * (0.35 + rand() * 0.6) * Math.min(1, 0.5 + spread * 0.6)
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(Math.cos(a) * r * 0.45, -d * 0.3, Math.sin(a) * r * 0.45),
        new THREE.Vector3(Math.cos(a + 0.3) * r * 0.9, -d * 0.7, Math.sin(a + 0.3) * r * 0.9),
        new THREE.Vector3(Math.cos(a + 0.9) * r * 0.8, -d, Math.sin(a + 0.9) * r * 0.8),
      ])
      out.push(new THREE.TubeGeometry(curve, 6, 0.0016 + rand() * 0.0022, 4, false))
    }
    return out
  }, [Math.round(snap.rootFill * 12), radius, depth])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  // healthy roots are pale and firm; rotted roots are brown
  const color = useMemo(() => new THREE.Color('#5a3d28').lerp(new THREE.Color('#e9dfc8'), snap.rootHealth), [snap.rootHealth])
  return (
    <group>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial roughness={0.8} color={color} emissive={SELECT_COLOR} emissiveIntensity={selected ? 0.35 : 0} />
        </mesh>
      ))}
    </group>
  )
}

/** Procedural plant. Form comes from the species profile, state from the simulation snapshot. */
export function Plant() {
  const snap = useSnapshot()
  const pot = useLab((s) => s.experiment.config.pot)
  const speciesId = useLab((s) => s.experiment.config.speciesId)
  const azimuth = useLab((s) => s.experiment.config.light.azimuthDeg)
  const select = useLab((s) => s.select)
  const plantHidden = useHidden('plant')
  const leavesHidden = useHidden('leaves')
  const stemsHidden = useHidden('stems')
  const rootsHidden = useHidden('roots')
  const leavesSelected = useSelected('leaves')
  const stemsSelected = useSelected('stems')

  const sp = getSpecies(speciesId)
  const dims = potDims(pot)
  const plan = useMemo(() => layout({ snap, sp, sunAz: rad(azimuth), dims }), [snap, sp, azimuth, pot.shape, pot.widthCm, pot.heightCm])

  const leafMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(SELECT_COLOR), emissiveIntensity: 0 }),
    [],
  )
  const stemMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.75, emissive: new THREE.Color(SELECT_COLOR), emissiveIntensity: 0 }), [])
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.75, emissive: new THREE.Color(SELECT_COLOR), emissiveIntensity: 0 }), [])
  leafMaterial.emissiveIntensity = leavesSelected ? 0.22 : 0
  stemMaterial.emissiveIntensity = stemsSelected ? 0.4 : 0
  trunkMaterial.emissiveIntensity = stemsSelected ? 0.4 : 0
  // stalks take their tone from the foliage; a declining plant dulls toward olive-brown
  const decline = Math.min(1, (1 - snap.health / 100) * 0.9 + snap.chlorosis * 0.4)
  stemMaterial.color.set(sp.leaf.color).lerp(new THREE.Color('#7fae4a'), 0.35).lerp(new THREE.Color('#8a7a3e'), decline)
  trunkMaterial.color.set(sp.habit === 'cane' ? '#6b5a44' : '#566b34').lerp(new THREE.Color('#6b5632'), Math.min(1, 1 - snap.health / 100))

  // aerial roots: thin cords from older nodes down to the medium (climbing aroids only)
  const aerial = useMemo(() => {
    const out: THREE.Vector3[][] = []
    if (sp.habit !== 'climber') return out
    const stem = plan.stems[0]
    const r = mediumRadius(dims) * 0.75
    for (let i = 2; i < stem.length - 2; i += 3) {
      const from = stem[i]
      const a = i * 2.1
      const to = new THREE.Vector3(Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7)
      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(Math.cos(a) * r * 0.5, from.y * 0.15, Math.sin(a) * r * 0.5))
      out.push([from, mid, to])
    }
    return out
  }, [plan, sp.habit, dims.radius])
  const aerialMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.75, color: '#6a4f35' }), [])

  if (plantHidden) return null
  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select(id)
  }

  return (
    <group position={[0, dims.fillY + (pot.drainageHoles ? 0.006 : 0), 0]}>
      {!leavesHidden && (
        <group onClick={pick('leaves')}>
          {plan.leaves.map((p) => (
            <Leaf key={p.leaf.id} p={p} sp={sp} chlorosis={snap.chlorosis} material={leafMaterial} />
          ))}
        </group>
      )}
      {!stemsHidden && (
        <group onClick={pick('stems')}>
          {plan.stems.map((pts, i) => (
            <Tube key={i} points={pts} radius={plan.stemRadius} material={trunkMaterial} />
          ))}
          {plan.leaves.map((p) => (p.hasPetiole ? <Tube key={p.leaf.id} points={[p.node, p.control, p.end]} radius={p.petioleRadius} material={stemMaterial} segments={14} /> : null))}
          {aerial.map((pts, i) => (
            <Tube key={`a${i}`} points={pts} radius={0.0022} material={aerialMaterial} segments={10} />
          ))}
        </group>
      )}
      {!rootsHidden && (
        <group onClick={pick('roots')}>
          <Roots snap={snap} radius={mediumRadius(dims)} depth={dims.fillY * 0.9} />
        </group>
      )}
    </group>
  )
}

const SHARED = {
  leaf: new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true, side: THREE.DoubleSide }),
  aerial: new THREE.MeshStandardMaterial({ roughness: 0.75, color: '#6a4f35' }),
}

/**
 * The same procedural plant, driven by props instead of the lab store, so the
 * garden can show many plants at once. Not selectable part by part.
 */
export function PlantModel({ snap, sp, pot, azimuth = 135 }: { snap: DaySnapshot; sp: SpeciesProfile; pot: { shape: 'tapered' | 'cylinder' | 'bowl' | 'square'; widthCm: number; heightCm: number; drainageHoles: boolean } & Record<string, unknown>; azimuth?: number }) {
  const dims = potDims(pot as Parameters<typeof potDims>[0])
  const plan = useMemo(() => layout({ snap, sp, sunAz: rad(azimuth), dims }), [snap, sp, azimuth, pot.shape, pot.widthCm, pot.heightCm])
  const decline = Math.min(1, (1 - snap.health / 100) * 0.9 + snap.chlorosis * 0.4)
  const stemMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.75, color: new THREE.Color(sp.leaf.color).lerp(new THREE.Color('#7fae4a'), 0.35).lerp(new THREE.Color('#8a7a3e'), decline) }),
    [sp.leaf.color, Math.round(decline * 10)],
  )
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.75, color: sp.habit === 'cane' ? '#6b5a44' : '#566b34' }), [sp.habit])
  return (
    <group position={[0, dims.fillY + (pot.drainageHoles ? 0.006 : 0), 0]}>
      {plan.leaves.map((p) => (
        <Leaf key={p.leaf.id} p={p} sp={sp} chlorosis={snap.chlorosis} material={SHARED.leaf} />
      ))}
      {plan.stems.map((pts, i) => (
        <Tube key={i} points={pts} radius={plan.stemRadius} material={trunkMaterial} />
      ))}
      {plan.leaves.map((p) => (p.hasPetiole ? <Tube key={p.leaf.id} points={[p.node, p.control, p.end]} radius={p.petioleRadius} material={stemMaterial} segments={14} /> : null))}
    </group>
  )
}
