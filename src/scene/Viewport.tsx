import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { getSpecies } from '../sim/species'
import { useLab, type CameraPreset } from '../store/useLab'
import { Atmosphere } from './Atmosphere'
import { GrowLights, SCENE_TARGET, Sun } from './Lighting'
import { Plant } from './Plant'
import { Medium, Pot } from './Pot'
import { Bench, Greenhouse, HOUSE, Island } from './Scenery'
import { Tools, type ToolTip } from './Tools'

const CAMERA_HOME: Record<CameraPreset, [number, number, number]> = {
  iso: [1.35, 0.85, 2.05],
  front: [0, 0.5, 2.15],
  side: [2.15, 0.5, 0],
  top: [0.001, 2.6, 0.001],
}

/** Where the plant being edited stands, in the greenhouse's own coordinates: the middle of the back bench. */
export const BENCH_HEIGHT = 0.8
const BENCH_SPOT = new THREE.Vector3(0.08, BENCH_HEIGHT, -HOUSE.depth / 2 + 0.36)
/** Outside the greenhouse, where the garden view looks from. The editor camera flies in from here. */
const APPROACH = new THREE.Vector3(4.6, 3.0, 5.6)

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const request = useLab((s) => s.cameraRequest)
  const autoRotate = useLab((s) => s.view.autoRotate)
  const dragging = useLab((s) => s.dragging)
  const { camera } = useThree()
  const experimentId = useLab((s) => s.experiment.id)
  const speciesId = useLab((s) => s.experiment.config.speciesId)
  const flight = useRef<{ t: number; from: THREE.Vector3; to: THREE.Vector3 } | null>(null)
  const [flying, setFlying] = useState(false)

  // frame the plant (small species get a closer camera), arriving by flying in from the garden view
  useEffect(() => {
    const { config } = useLab.getState().experiment
    const sp = getSpecies(config.speciesId)
    const reach = sp.habit === 'trailing' ? 0.3 : (sp.growth.matureLeafCm / 100) * (sp.habit === 'cane' ? 2.2 : 1.25)
    const size = config.pot.heightCm / 100 + reach
    const scale = THREE.MathUtils.clamp(size / 0.78, 0.85, 1.25)
    const to = SCENE_TARGET.clone().add(new THREE.Vector3(...CAMERA_HOME.iso).sub(SCENE_TARGET).multiplyScalar(scale))
    controls.current?.target.copy(SCENE_TARGET).setY(SCENE_TARGET.y * Math.min(1, scale + 0.15))
    flight.current = { t: 0, from: APPROACH.clone(), to }
    camera.position.copy(APPROACH)
    setFlying(true)
  }, [experimentId, speciesId, camera])

  useFrame((_, dt) => {
    const f = flight.current
    if (!f) return
    f.t = Math.min(1, f.t + dt / 1.25)
    const e = 1 - Math.pow(1 - f.t, 3)
    camera.position.lerpVectors(f.from, f.to, e)
    controls.current?.update()
    if (f.t >= 1) {
      flight.current = null
      setFlying(false)
    }
  })

  useEffect(() => {
    if (request.n === 0) return
    flight.current = null
    camera.position.set(...CAMERA_HOME[request.preset])
    controls.current?.target.copy(SCENE_TARGET)
    controls.current?.update()
  }, [request, camera])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!dragging && !flying}
      target={SCENE_TARGET}
      enableDamping
      dampingFactor={0.12}
      minDistance={0.45}
      maxDistance={3.2}
      maxPolarAngle={Math.PI * 0.48}
      autoRotate={autoRotate}
      autoRotateSpeed={0.6}
    />
  )
}

/**
 * The editor's set: the same island greenhouse as the garden view, shifted so
 * the potting-bench spot is at the origin. The plant, its pot and the tools
 * all stand on that bench.
 */
function BenchSet() {
  const grid = useLab((s) => s.view.grid && s.view.advanced)
  return (
    <>
      <group position={[-BENCH_SPOT.x, -BENCH_SPOT.y, -BENCH_SPOT.z]}>
        <Island />
        <Greenhouse />
        <Bench position={[0.08, 0, BENCH_SPOT.z]} length={2.5} depth={0.5} height={BENCH_HEIGHT} />
        <Bench position={[-HOUSE.width / 2 + 0.36, 0, 0.32]} length={1.6} depth={0.5} height={BENCH_HEIGHT} along />
      </group>
      {/* the low sun through the back glass, as a warm rim; the adjustable sun stays the key light */}
      <directionalLight position={[-3.2, 3.8, -4.4]} intensity={1.5} color="#ffc37a" />
      <pointLight position={[0.3, 0.9, 1.5]} intensity={0.9} color="#ffd6a0" distance={4} decay={1.6} />
      {grid && (
        <Grid position={[0, 0.0005, 0]} args={[2, 2]} cellSize={0.1} cellThickness={0.6} cellColor="#5a3d2a" sectionSize={0.5} sectionThickness={1} sectionColor="#3b2a1e" fadeDistance={2.2} fadeStrength={2} />
      )}
    </>
  )
}

export function Viewport() {
  const select = useLab((s) => s.select)
  const advanced = useLab((s) => s.view.advanced)
  const [tip, setTip] = useState<ToolTip | null>(null)
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: APPROACH.toArray(), fov: 40, near: 0.05, far: 120 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        style={{ position: 'absolute', inset: 0 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
        }}
        onPointerMissed={(e) => {
          if (e.type === 'click') select(null)
        }}
      >
        <CameraRig />
        <BenchSet />
        <Sun />
        <GrowLights />
        <Pot />
        <Medium />
        <Plant />
        <Atmosphere />
        <Tools onTip={setTip} />
        {advanced && (
          <GizmoHelper alignment="bottom-right" margin={[60, 92]}>
            <GizmoViewport axisColors={['#b5653a', '#2f5d3a', '#4a6f8a']} labelColor="#f6f4ef" />
          </GizmoHelper>
        )}
      </Canvas>
      {tip && (
        <div className="pointer-events-none fixed z-30 -translate-x-1/2 rounded-[8px] bg-ink px-2.5 py-1.5 text-surface shadow-[0_3px_0_rgba(0,0,0,0.18)]" style={{ left: tip.x, top: tip.y - 58 }}>
          <div className="whitespace-nowrap text-[12.5px] font-medium leading-tight">{tip.label}</div>
          <div className="whitespace-nowrap text-[10.5px] leading-tight opacity-70">{tip.hint}</div>
        </div>
      )}
    </>
  )
}
