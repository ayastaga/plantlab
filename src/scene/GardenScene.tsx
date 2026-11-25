import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { initialSnapshot, runSimulation } from '../sim/engine'
import { MEDIA, MEDIUM_IDS } from '../sim/media'
import { getSpecies } from '../sim/species'
import type { Experiment } from '../sim/types'
import { PlantModel } from './Plant'
import { plugGeometry, potGeometry } from './Pot'
import { Backdrop } from './Backdrop'
import { Bench, GoldenLight, Greenhouse, HOUSE, Island } from './Scenery'
import { potDims, potRadiusAt } from './util'

const BENCH_Y = 0.8
const BACK_Z = -HOUSE.depth / 2 + 0.36
const SIDE_X = -HOUSE.width / 2 + 0.36

/** Where pots go: the bench along the back wall, then the one along the left wall; tall plants stand on the floor. */
function slots(count: number): { bench: [number, number, number][]; floor: [number, number, number][] } {
  const bench: [number, number, number][] = []
  for (let i = 0; i < 6; i++) bench.push([-0.72 + i * 0.4, BENCH_Y, BACK_Z + (i % 2) * 0.07])
  for (let i = 0; i < 4; i++) bench.push([SIDE_X + (i % 2) * 0.06, BENCH_Y, -0.3 + i * 0.4])
  for (let i = 0; bench.length < count; i++) bench.push([-0.5 + (i % 5) * 0.4, 0, 0.2 + Math.floor(i / 5) * 0.4])
  const floor: [number, number, number][] = [
    [1.25, 0, -0.75],
    [0.55, 0, 0.35],
    [1.3, 0, 0.3],
    [-0.2, 0, 0.75],
    [0.9, 0, 0.9],
  ]
  return { bench, floor }
}

interface Tip {
  name: string
  species: string
  x: number
  y: number
}

function GardenPot({ exp, position, onOpen, onTip }: { exp: Experiment; position: [number, number, number]; onOpen: () => void; onTip: (tip: Tip | null) => void }) {
  const [hover, setHover] = useState(false)
  const sp = getSpecies(exp.config.speciesId)
  const pot = exp.config.pot
  const d = potDims(pot)
  // the garden shows each plant as its conditions leave it after three months
  const snap = useMemo(() => {
    const r = runSimulation(exp.config, 90)
    return r.growth.survived ? r.snapshots[r.snapshots.length - 1] : initialSnapshot(exp.config)
  }, [exp.config])
  const shell = useMemo(() => potGeometry(d, pot.material), [pot.shape, pot.heightCm, pot.widthCm, pot.material])
  const plug = useMemo(() => plugGeometry(d), [pot.shape, pot.heightCm, pot.widthCm])
  useEffect(() => () => { shell.dispose(); plug.dispose() }, [shell, plug])
  const soil = useMemo(() => {
    const c = new THREE.Color(0, 0, 0)
    let total = 0
    for (const id of MEDIUM_IDS) {
      const f = exp.config.medium.mix[id]
      if (!f) continue
      const col = new THREE.Color(MEDIA[id].color).lerp(new THREE.Color(MEDIA[id].wetColor), 0.5)
      c.r += col.r * f; c.g += col.g * f; c.b += col.b * f
      total += f
    }
    return total ? c.multiplyScalar(1 / total) : new THREE.Color('#4a3526')
  }, [exp.config.medium.mix])
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => { document.body.style.cursor = '' }
  }, [hover])
  const seed = exp.id.split('').reduce((n, ch) => n + ch.charCodeAt(0), 0)

  return (
    <group
      position={position}
      rotation={[0, (seed % 7) * 0.9, 0]}
      scale={hover ? 1.06 : 1}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true) }}
      onPointerMove={(e) => { e.stopPropagation(); onTip({ name: exp.name, species: sp.scientificName, x: e.clientX, y: e.clientY }) }}
      onPointerOut={() => { setHover(false); onTip(null) }}
      onClick={(e) => { e.stopPropagation(); onTip(null); onOpen() }}
    >
      <mesh geometry={shell} rotation={[0, d.twist, 0]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.8} color={pot.color} transparent={pot.material === 'glass'} opacity={pot.material === 'glass' ? 0.4 : 1} />
      </mesh>
      <mesh geometry={plug} rotation={[0, d.twist, 0]}>
        <meshStandardMaterial roughness={0.8} color={soil} />
      </mesh>
      <PlantModel snap={snap} sp={sp} pot={pot} azimuth={200} />
      {/* generous invisible hit volume so small plants are easy to click */}
      <mesh position={[0, d.height * 0.9, 0]} visible={false}>
        <cylinderGeometry args={[Math.max(0.11, potRadiusAt(d, 1) * 1.3), potRadiusAt(d, 0), d.height * 2.4, 8]} />
      </mesh>
    </group>
  )
}

/** An open place on the bench. Clicking it adds a plant; the next free place carries a small marker so it can be found. */
function EmptySlot({ position, marked, onAdd }: { position: [number, number, number]; marked: boolean; onAdd: () => void }) {
  const [hover, setHover] = useState(false)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => { document.body.style.cursor = '' }
  }, [hover])
  const show = hover || marked
  const strength = hover ? 1 : 0.6
  return (
    <group position={position}>
      <mesh
        position={[0, 0.14, 0]}
        visible={false}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true) }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => { e.stopPropagation(); onAdd() }}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.3, 10]} />
      </mesh>
      {show && (
        <group scale={hover ? 1.15 : 1} raycast={() => null}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} raycast={() => null}>
            <ringGeometry args={[0.07, 0.088, 28]} />
            <meshBasicMaterial color="#fffbe6" transparent opacity={0.9 * strength} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} raycast={() => null}>
            <circleGeometry args={[0.07, 28]} />
            <meshBasicMaterial color="#fffbe6" transparent opacity={0.3 * strength} depthWrite={false} />
          </mesh>
          {/* a plus sign standing over the spot */}
          <group position={[0, 0.13, 0]}>
            <mesh raycast={() => null}>
              <boxGeometry args={[0.075, 0.018, 0.012]} />
              <meshBasicMaterial color="#fffbe6" transparent opacity={strength} />
            </mesh>
            <mesh raycast={() => null}>
              <boxGeometry args={[0.018, 0.075, 0.012]} />
              <meshBasicMaterial color="#fffbe6" transparent opacity={strength} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  )
}

/** Slanting shafts of light through the roof glass. */
function SunShafts() {
  const map = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 256
    const ctx = c.getContext('2d')!
    const down = ctx.createLinearGradient(0, 0, 0, 256)
    down.addColorStop(0, 'rgba(255,255,255,0.9)')
    down.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = down
    ctx.fillRect(0, 0, 64, 256)
    ctx.globalCompositeOperation = 'destination-in'
    const across = ctx.createLinearGradient(0, 0, 64, 0)
    across.addColorStop(0, 'rgba(0,0,0,0)')
    across.addColorStop(0.5, 'rgba(0,0,0,1)')
    across.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = across
    ctx.fillRect(0, 0, 64, 256)
    return new THREE.CanvasTexture(c)
  }, [])
  useEffect(() => () => map.dispose(), [map])
  const shafts: [number, number, number][] = [
    [-0.75, 0.5, 0.2],
    [0.1, 0.62, 0.16],
    [0.9, 0.44, 0.13],
  ]
  return (
    <group raycast={() => null}>
      {shafts.map(([x, width, opacity], i) => (
        <mesh key={i} position={[x, 1.25, -0.55]} rotation={[0.62, 0.25, 0]} raycast={() => null} renderOrder={6}>
          <planeGeometry args={[width, 2.9]} />
          <meshBasicMaterial map={map} color="#ffe2a6" transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The home screen: a greenhouse holding every plant you keep, seen from one
 * fixed viewpoint like a painted background. Click a pot to open it in the
 * lab; click an open place on the bench to add a plant.
 */
export function GardenScene({ plants, onOpen, onAdd }: { plants: Experiment[]; onOpen: (id: string) => void; onAdd: () => void }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const { placed, free } = useMemo(() => {
    const { bench, floor } = slots(plants.length + 1)
    let b = 0
    let f = 0
    const placed = plants.map((exp) => {
      const sp = getSpecies(exp.config.speciesId)
      const tall = (sp.habit === 'cane' || sp.growth.matureLeafCm > 55 || exp.config.pot.widthCm > 24) && f < floor.length
      return { exp, position: tall ? floor[f++] : bench[b++ % bench.length] }
    })
    return { placed, free: bench.slice(b) }
  }, [plants])
  return (
    <div className="absolute inset-0">
      <Backdrop />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [4.5, 3.0, 5.0], fov: 30, near: 0.1, far: 120 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        style={{ position: 'absolute', inset: 0 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.15
        }}
      >
        <GoldenLight />
        {/* turn around the island, but never underneath it or behind the built walls */}
        <OrbitControls makeDefault target={[-0.1, 0.95, -0.1]} enablePan={false} enableDamping dampingFactor={0.1} minDistance={3.2} maxDistance={13} minPolarAngle={0.85} maxPolarAngle={1.45} minAzimuthAngle={-0.1} maxAzimuthAngle={1.6} />
        <Island />
        <Greenhouse />
        <Bench position={[0.08, 0, BACK_Z]} length={2.5} depth={0.5} height={BENCH_Y} />
        <Bench position={[SIDE_X, 0, 0.32]} length={1.6} depth={0.5} height={BENCH_Y} along />
        {placed.map(({ exp, position }) => (
          <GardenPot key={exp.id} exp={exp} position={position} onOpen={() => onOpen(exp.id)} onTip={setTip} />
        ))}
        {free.map((position, i) => (
          <EmptySlot key={position.join()} position={position} marked={i === 0} onAdd={onAdd} />
        ))}
        <SunShafts />
      </Canvas>
      {tip && (
        <div className="pointer-events-none fixed z-30 -translate-x-1/2 rounded-[8px] bg-ink px-2.5 py-1.5 text-surface shadow-[0_3px_0_rgba(0,0,0,0.18)]" style={{ left: tip.x, top: tip.y - 58 }}>
          <div className="whitespace-nowrap text-[12.5px] font-medium leading-tight">{tip.name}</div>
          <div className="whitespace-nowrap text-[10.5px] italic leading-tight opacity-70">{tip.species}</div>
        </div>
      )}
      {/* warm glow where the sun enters, laid over the render */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(38% 42% at 40% 30%, rgba(255,214,150,0.22), rgba(255,214,150,0) 70%)' }} />
    </div>
  )
}
