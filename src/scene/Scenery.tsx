import { useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from './leafGeometry'

/**
 * The 3D set: a cutaway greenhouse diorama and its benches. Everything beyond
 * the glass (sky, clouds) is flat 2D art drawn behind the canvas, see
 * Backdrop.tsx.
 */
const TIMBER = '#3b2d24'
const TIMBER_LIGHT = '#5a4433'
const BENCH_WOOD = '#7a5236'
const BENCH_DARK = '#4c3324'
const STONE = '#8d8776'
const BASE = '#241c18'
const TILES = ['#c98a5c', '#bf7f52', '#d39a6a', '#b87649']

export const HOUSE = { width: 3.4, depth: 2.6, wall: 2.0, ridge: 2.75, plinth: 0.42 }

function Box({ p, s, color, cast = true, rough = 0.9 }: { p: [number, number, number]; s: [number, number, number]; color: string; cast?: boolean; rough?: number }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow raycast={() => null}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  )
}

function Glass({ p, s, rot }: { p: [number, number, number]; s: [number, number]; rot: [number, number, number] }) {
  return (
    <mesh position={p} rotation={rot} raycast={() => null}>
      <planeGeometry args={s} />
      <meshStandardMaterial color="#dff3f2" transparent opacity={0.1} roughness={0.05} metalness={0.2} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  )
}

/**
 * Cutaway glasshouse, in the manner of an isometric room diorama: the back
 * and left walls and the rear roof slope are built, the front and right are
 * open to the viewer, and the whole thing sits on a dark base slab.
 */
export function Greenhouse() {
  const { width: W, depth: D, wall, ridge, plinth } = HOUSE
  const w = W / 2
  const d = D / 2
  const tiles = useMemo(() => {
    const rand = mulberry32(31)
    const out: { x: number; z: number; c: string }[] = []
    const n = 0.34
    for (let x = -w + n / 2; x < w - 0.01; x += n) for (let z = -d + n / 2; z < d - 0.01; z += n) out.push({ x, z, c: TILES[Math.floor(rand() * TILES.length)] })
    return out
  }, [w, d])
  const postsBack = [-w, -w + W / 4, 0, w - W / 4, w]
  const postsLeft = [-d, -d + D / 3, d - D / 3, d]
  const slope = Math.atan2(ridge - wall, d)
  const rafter = Math.hypot(d, ridge - wall)
  const gableHeight = (z: number) => wall + (ridge - wall) * (1 - Math.abs(z) / d)

  return (
    <group>
      {/* base slab: the dark cut edge of the diorama */}
      <Box p={[0, -0.11, 0]} s={[W + 0.16, 0.22, D + 0.16]} color={BASE} rough={1} />
      <Box p={[0, 0.001, 0]} s={[W, 0.004, D]} color="#6e5646" cast={false} />
      {tiles.map((t, i) => (
        <mesh key={i} position={[t.x, 0.006, t.z]} receiveShadow raycast={() => null}>
          <boxGeometry args={[0.32, 0.012, 0.32]} />
          <meshStandardMaterial color={t.c} roughness={0.85} />
        </mesh>
      ))}

      {/* stone plinths under the glazing */}
      <Box p={[0, plinth / 2, -d]} s={[W, plinth, 0.12]} color={STONE} />
      <Box p={[-w, plinth / 2, 0]} s={[0.12, plinth, D]} color={STONE} />

      {/* timber frame: posts, sill, top plate, mid rail */}
      {postsBack.map((x) => (
        <Box key={`b${x}`} p={[x, wall / 2, -d]} s={[0.09, wall, 0.09]} color={TIMBER} />
      ))}
      {postsLeft.map((z) => (
        <Box key={`l${z}`} p={[-w, gableHeight(z) / 2, z]} s={[0.09, gableHeight(z), 0.09]} color={TIMBER} />
      ))}
      <Box p={[0, wall, -d]} s={[W + 0.09, 0.09, 0.11]} color={TIMBER} />
      <Box p={[0, plinth + 0.03, -d]} s={[W, 0.06, 0.13]} color={TIMBER_LIGHT} />
      <Box p={[0, (wall + plinth) / 2 + 0.25, -d]} s={[W, 0.04, 0.06]} color={TIMBER} />
      <Box p={[-w, plinth + 0.03, 0]} s={[0.13, 0.06, D]} color={TIMBER_LIGHT} />
      <Box p={[-w, (wall + plinth) / 2 + 0.25, 0]} s={[0.06, 0.04, D]} color={TIMBER} />
      {/* left gable rake and ridge */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-w, (wall + ridge) / 2, (s * d) / 2]} rotation={[s * slope, 0, 0]} castShadow raycast={() => null}>
          <boxGeometry args={[0.09, 0.08, rafter + 0.06]} />
          <meshStandardMaterial color={TIMBER} roughness={0.9} />
        </mesh>
      ))}
      <Box p={[0, ridge, 0]} s={[W + 0.09, 0.09, 0.1]} color={TIMBER} />
      {/* rear roof slope: rafters and a purlin */}
      {postsBack.map((x) => (
        <mesh key={`r${x}`} position={[x, (wall + ridge) / 2, -d / 2]} rotation={[-slope, 0, 0]} castShadow raycast={() => null}>
          <boxGeometry args={[0.07, 0.07, rafter + 0.04]} />
          <meshStandardMaterial color={TIMBER} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, (wall + ridge) / 2, -d / 2]} rotation={[-slope, 0, 0]} castShadow raycast={() => null}>
        <boxGeometry args={[W, 0.05, 0.05]} />
        <meshStandardMaterial color={TIMBER} roughness={0.9} />
      </mesh>

      {/* glazing: faint, and never casting shadow, so the sun comes through */}
      <Glass p={[0, (wall + plinth) / 2, -d]} s={[W, wall - plinth]} rot={[0, 0, 0]} />
      <Glass p={[-w, (wall + plinth) / 2, 0]} s={[D, wall - plinth]} rot={[0, Math.PI / 2, 0]} />
      <Glass p={[0, (wall + ridge) / 2, -d / 2]} s={[W, rafter]} rot={[Math.PI / 2 - slope, 0, 0]} />
    </group>
  )
}

/** Slatted potting bench. Its top surface is at `height`. `along` turns it to run along the Z axis. */
export function Bench({ position, length, depth = 0.5, height = 0.8, along = false }: { position: [number, number, number]; length: number; depth?: number; height?: number; along?: boolean }) {
  const slats = 5
  const gap = 0.018
  const slat = (depth - gap * (slats - 1)) / slats
  const legs: [number, number][] = [
    [-length / 2 + 0.08, -depth / 2 + 0.05],
    [length / 2 - 0.08, -depth / 2 + 0.05],
    [-length / 2 + 0.08, depth / 2 - 0.05],
    [length / 2 - 0.08, depth / 2 - 0.05],
  ]
  return (
    <group position={position} rotation={[0, along ? Math.PI / 2 : 0, 0]}>
      {Array.from({ length: slats }, (_, i) => (
        <mesh key={i} position={[0, height - 0.018, -depth / 2 + slat / 2 + i * (slat + gap)]} castShadow receiveShadow>
          <boxGeometry args={[length, 0.036, slat]} />
          <meshStandardMaterial color={i % 2 ? BENCH_WOOD : '#84593b'} roughness={0.85} />
        </mesh>
      ))}
      {/* apron and lower shelf */}
      {[-1, 1].map((s) => (
        <Box key={s} p={[0, height - 0.08, (s * (depth - 0.04)) / 2]} s={[length - 0.1, 0.08, 0.03]} color={BENCH_DARK} />
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <Box key={`s${i}`} p={[0, height * 0.32, -depth / 3 + (i * depth) / 3]} s={[length - 0.14, 0.028, depth / 3 - 0.03]} color={BENCH_DARK} />
      ))}
      {legs.map(([x, z], i) => (
        <Box key={`g${i}`} p={[x, (height - 0.036) / 2, z]} s={[0.06, height - 0.036, 0.06]} color={BENCH_DARK} />
      ))}
    </group>
  )
}

/* ---------- the floating island the greenhouse stands on ---------- */

const GRASS = '#86a548'
const GRASS_DARK = '#6c8c3a'
const ROCK = '#8a7b6e'
const ROCK_DARK = '#5e5149'
const FOLIAGE = ['#3f6a37', '#56823c', '#7fa046']
export const ISLAND_RADIUS = 3.8

function jitter(g: THREE.BufferGeometry, seed: number, amount: number, keepTop = false): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const pos = g.getAttribute('position')
  // move coincident vertices together so facets stay closed
  const moved = new Map<string, [number, number, number]>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    if (!moved.has(key)) moved.set(key, [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount])
    const [dx, dy, dz] = moved.get(key)!
    const top = keepTop && pos.getY(i) > -0.001
    pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + (top ? 0 : dy), pos.getZ(i) + dz)
  }
  g.computeVertexNormals()
  return g
}

function Lump({ p, s, color, seed, detail = 0 }: { p: [number, number, number]; s: [number, number, number]; color: string; seed: number; detail?: number }) {
  const geometry = useMemo(() => jitter(new THREE.IcosahedronGeometry(1, detail), seed, 0.28), [seed, detail])
  return (
    <mesh geometry={geometry} position={p} scale={s} castShadow receiveShadow raycast={() => null}>
      <meshStandardMaterial color={color} roughness={0.95} flatShading />
    </mesh>
  )
}

function Tree({ position }: { position: [number, number, number] }) {
  const trunk = useMemo(() => {
    // a windswept trunk leaning back over the roof
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.2, 0),
      new THREE.Vector3(0.12, 0.7, 0.05),
      new THREE.Vector3(-0.15, 1.5, -0.05),
      new THREE.Vector3(-0.75, 2.25, -0.2),
      new THREE.Vector3(-1.5, 2.75, -0.3),
    ])
    return new THREE.TubeGeometry(curve, 10, 0.13, 6, false)
  }, [])
  const crowns: [number, number, number, number, number][] = [
    [-1.6, 3.0, -0.3, 1.15, 0],
    [-0.75, 3.1, 0.25, 0.95, 1],
    [-2.3, 2.8, 0.1, 0.85, 1],
    [-1.2, 3.45, -0.6, 0.8, 2],
    [-0.2, 2.7, -0.35, 0.7, 0],
    [-1.9, 3.3, 0.5, 0.6, 2],
  ]
  return (
    <group position={position}>
      <mesh geometry={trunk} castShadow raycast={() => null}>
        <meshStandardMaterial color="#4a362b" roughness={1} flatShading />
      </mesh>
      {crowns.map(([x, y, z, r, tone], i) => (
        <Lump key={i} p={[x, y, z]} s={[r, r * 0.62, r * 0.9]} color={FOLIAGE[tone]} seed={300 + i} detail={1} />
      ))}
    </group>
  )
}

/**
 * Floating island: a grassy cap on a tapering mass of rock, with a leaning
 * tree, shrubs, boulders and a stepping-stone path up to the greenhouse.
 * The greenhouse floor is at y = 0; the turf sits just below it.
 */
export function Island() {
  const R = ISLAND_RADIUS
  const cap = useMemo(() => jitter(new THREE.CylinderGeometry(R, R * 0.9, 0.5, 13, 1), 51, 0.22, true), [R])
  const rock = useMemo(() => jitter(new THREE.ConeGeometry(R * 0.93, 4.4, 10, 4), 52, 0.5), [R])
  const scatter = useMemo(() => {
    const rand = mulberry32(77)
    const bushes: { p: [number, number, number]; r: number; tone: number }[] = []
    const rocks: { p: [number, number, number]; r: number }[] = []
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rand() * 0.3
      const d = R * (0.74 + rand() * 0.18)
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      // keep the approach to the open front and the path clear
      if (x > 0.2 && z > 0.6 && d < R * 0.86) continue
      if (rand() > 0.42) bushes.push({ p: [x, -0.02, z], r: 0.3 + rand() * 0.3, tone: Math.floor(rand() * 3) })
      else rocks.push({ p: [x, -0.05, z], r: 0.2 + rand() * 0.28 })
    }
    return { bushes, rocks }
  }, [R])
  const stones: [number, number, number][] = [
    [0.55, 1.75, 0.2],
    [0.75, 2.2, 0.18],
    [0.6, 2.65, 0.21],
    [0.85, 3.1, 0.17],
  ]
  return (
    <group raycast={() => null}>
      <mesh geometry={cap} position={[0, -0.36, 0]} receiveShadow raycast={() => null}>
        <meshStandardMaterial color={GRASS} roughness={1} flatShading />
      </mesh>
      {/* inverted cone of rock tapering away beneath */}
      <mesh geometry={rock} position={[0, -2.75, 0]} rotation={[Math.PI, 0, 0]} castShadow raycast={() => null}>
        <meshStandardMaterial color={ROCK} roughness={1} flatShading />
      </mesh>
      <Lump p={[1.4, -3.3, 0.6]} s={[0.9, 1.1, 0.8]} color={ROCK_DARK} seed={61} />
      <Lump p={[-1.2, -2.6, -0.8]} s={[1.0, 0.9, 1.0]} color={ROCK_DARK} seed={62} />
      <Lump p={[0.2, -4.6, -0.2]} s={[0.5, 0.8, 0.5]} color={ROCK_DARK} seed={63} />
      {scatter.bushes.map((b, i) => (
        <group key={`b${i}`} position={b.p}>
          <Lump p={[0, b.r * 0.55, 0]} s={[b.r, b.r * 0.75, b.r]} color={FOLIAGE[b.tone]} seed={100 + i} detail={1} />
          <Lump p={[b.r * 0.7, b.r * 0.4, b.r * 0.2]} s={[b.r * 0.65, b.r * 0.5, b.r * 0.65]} color={FOLIAGE[(b.tone + 1) % 3]} seed={140 + i} detail={1} />
        </group>
      ))}
      {scatter.rocks.map((r, i) => (
        <Lump key={`r${i}`} p={[r.p[0], r.r * 0.35 - 0.08, r.p[2]]} s={[r.r, r.r * 0.7, r.r * 0.9]} color={i % 2 ? ROCK : '#9a8c7d'} seed={200 + i} />
      ))}
      {stones.map(([x, z, r], i) => (
        <mesh key={`s${i}`} position={[x, -0.09, z]} rotation={[0, i * 1.3, 0]} receiveShadow raycast={() => null}>
          <cylinderGeometry args={[r, r * 0.9, 0.05, 7]} />
          <meshStandardMaterial color="#b3a696" roughness={1} flatShading />
        </mesh>
      ))}
      {/* a darker ring of turf where the grass meets the rock */}
      <mesh position={[0, -0.62, 0]} raycast={() => null}>
        <cylinderGeometry args={[R * 0.9, R * 0.8, 0.22, 13, 1, true]} />
        <meshStandardMaterial color={GRASS_DARK} roughness={1} flatShading side={THREE.DoubleSide} />
      </mesh>
      <Tree position={[3.05, -0.1, -2.2]} />
    </group>
  )
}

/** Shared golden-hour light for the island set: low warm sun from behind the glass, cool sky fill. */
export function GoldenLight({ shadowSpan = 4.6, castShadow = true }: { shadowSpan?: number; castShadow?: boolean }) {
  return (
    <>
      <hemisphereLight args={['#c3d2ff', '#7a5a40', 0.8]} />
      <ambientLight color="#93a2d6" intensity={0.3} />
      <directionalLight position={[-3.2, 4.6, -4.4]} intensity={4.0} color="#ffc37a" castShadow={castShadow} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03} shadow-radius={3}>
        <orthographicCamera attach="shadow-camera" args={[-shadowSpan, shadowSpan, shadowSpan, -shadowSpan, 0.5, 22]} />
      </directionalLight>
      <pointLight position={[0.4, 1.7, 0.6]} intensity={1.4} color="#ffd6a0" distance={5} decay={1.6} />
    </>
  )
}
