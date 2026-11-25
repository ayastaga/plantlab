import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useHidden, useLab, useSelected, useSnapshot } from '../store/useLab'
import { SELECT_COLOR, kelvinToColor, potDims, sunDirection, visualLight } from './util'

export const SUN_ORBIT_RADIUS = 0.78
export const SCENE_TARGET = new THREE.Vector3(0, 0.38, 0)

/** Both intersections of a ray with a sphere; returns the one nearest `prefer`. */
function raySphere(ray: THREE.Ray, center: THREE.Vector3, radius: number, prefer: THREE.Vector3): THREE.Vector3 | null {
  const oc = ray.origin.clone().sub(center)
  const b = oc.dot(ray.direction)
  const c = oc.dot(oc) - radius * radius
  const disc = b * b - c
  if (disc < 0) {
    // ray misses the dome: use the closest point on it, pushed out to the sphere
    const closest = ray.origin.clone().addScaledVector(ray.direction, -b)
    return center.clone().add(closest.sub(center).setLength(radius))
  }
  const s = Math.sqrt(disc)
  const hits = [-b - s, -b + s].filter((t) => t > 0).map((t) => ray.origin.clone().addScaledVector(ray.direction, t))
  if (!hits.length) return null
  hits.sort((p, q) => p.distanceToSquared(prefer) - q.distanceToSquared(prefer))
  return hits[0]
}

export function Sun() {
  const light = useLab((s) => s.experiment.config.light)
  const select = useLab((s) => s.select)
  const update = useLab((s) => s.update)
  const setDragging = useLab((s) => s.setDragging)
  const shadows = useLab((s) => s.view.shadows)
  const hidden = useHidden('sun')
  const selected = useSelected('sun')
  const dragging = useRef(false)
  const { gl } = useThree()

  const dir = useMemo(() => sunDirection(light.azimuthDeg, light.elevationDeg), [light.azimuthDeg, light.elevationDeg])
  const sunPos = useMemo(() => SCENE_TARGET.clone().addScaledVector(dir, SUN_ORBIT_RADIUS), [dir])
  // tinted toward the set's golden-hour sun so the editor and the garden share one mood
  const color = useMemo(() => kelvinToColor(light.colorK).lerp(new THREE.Color('#ffc37a'), 0.4), [light.colorK])
  const v = visualLight(light.ppfd)
  const direct = light.exposure === 'direct'
  // indirect light: weaker key, more fill, softer shadows
  const keyIntensity = (1.1 + 3.2 * v) * (direct ? 1 : 0.65)
  const fill = 1.25 + (direct ? 0.5 : 0.9) * v

  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.copy(SCENE_TARGET)
    return o
  }, [])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    select('sun')
    dragging.current = true
    setDragging(true)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    gl.domElement.style.cursor = 'grabbing'
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    e.stopPropagation()
    const hit = raySphere(e.ray, SCENE_TARGET, SUN_ORBIT_RADIUS, sunPos)
    if (!hit) return
    const rel = hit.sub(SCENE_TARGET).normalize()
    const elevation = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.asin(rel.y)), 5, 90)
    const azimuth = (THREE.MathUtils.radToDeg(Math.atan2(rel.x, rel.z)) + 360) % 360
    update((d) => {
      d.light.azimuthDeg = Math.round(azimuth)
      d.light.elevationDeg = Math.round(elevation)
    }, 'sun-drag')
  }
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    dragging.current = false
    setDragging(false)
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    gl.domElement.style.cursor = ''
  }

  // faint arc showing the path the sun handle travels at this azimuth
  const arc = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let el = 0; el <= 90; el += 5) pts.push(SCENE_TARGET.clone().addScaledVector(sunDirection(light.azimuthDeg, el), SUN_ORBIT_RADIUS))
    return pts
  }, [light.azimuthDeg])

  return (
    <>
      <hemisphereLight args={['#c3d2ff', '#7a5a40', fill * 0.8]} />
      <ambientLight intensity={0.3 + 0.25 * v} />
      <primitive object={target} />
      <directionalLight
        position={SCENE_TARGET.clone().addScaledVector(dir, 4)}
        target={target}
        color={color}
        intensity={keyIntensity}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.012}
        shadow-radius={direct ? 2.5 : 9}
        shadow-intensity={direct ? 0.95 : 0.55}
      >
        <orthographicCamera attach="shadow-camera" args={[-1.4, 1.4, 1.4, -1.4, 0.5, 9]} />
      </directionalLight>
      {!hidden && (
        <group>
          <mesh
            position={sunPos}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerOver={() => !dragging.current && (gl.domElement.style.cursor = 'grab')}
            onPointerOut={() => !dragging.current && (gl.domElement.style.cursor = '')}
          >
            <sphereGeometry args={[0.045, 32, 16]} />
            <meshBasicMaterial color={color.clone().lerp(new THREE.Color('#ffd27a'), 0.45)} toneMapped={false} />
          </mesh>
          {/* soft halo, larger when the light is direct */}
          <mesh position={sunPos} raycast={() => null}>
            <sphereGeometry args={[0.045 * (direct ? 1.9 : 1.5), 24, 12]} />
            <meshBasicMaterial color="#ffdf9a" transparent opacity={0.12 + 0.2 * v} depthWrite={false} toneMapped={false} />
          </mesh>
          {selected && (
            <mesh position={sunPos} raycast={() => null}>
              <sphereGeometry args={[0.066, 12, 8]} />
              <meshBasicMaterial color={SELECT_COLOR} wireframe transparent opacity={0.55} toneMapped={false} />
            </mesh>
          )}
          <Line points={[sunPos, SCENE_TARGET]} color={selected ? SELECT_COLOR : '#b9a26a'} lineWidth={1} dashed dashSize={0.035} gapSize={0.03} transparent opacity={selected ? 0.9 : 0.4} />
          {selected && <Line points={arc} color={SELECT_COLOR} lineWidth={1} transparent opacity={0.45} />}
        </group>
      )}
    </>
  )
}

export function GrowLights() {
  const lights = useLab((s) => s.experiment.config.light.growLights)
  const pot = useLab((s) => s.experiment.config.pot)
  const select = useLab((s) => s.select)
  const selection = useLab((s) => s.selection)
  const hidden = useLab((s) => s.hidden)
  const snap = useSnapshot()
  if (hidden.lights) return null

  // hang lamps a little above the tallest leaf
  const d = potDims(pot)
  const tallest = snap.leaves.reduce((m, l) => Math.max(m, l.sizeCm * l.expansion), 20) / 100
  const y = d.fillY + 0.25 + tallest * 1.35

  return (
    <group>
      {lights.map((g, i) => {
        if (hidden[`light:${g.id}`]) return null
        const a = (i / Math.max(1, lights.length)) * Math.PI * 2 + 0.6
        const r = lights.length > 1 ? 0.2 : 0
        const pos: [number, number, number] = [Math.cos(a) * r, y, Math.sin(a) * r]
        const selected = selection === `light:${g.id}` || selection === 'lights'
        const color = kelvinToColor(g.colorK)
        const on = g.enabled
        return (
          <group
            key={g.id}
            position={pos}
            onClick={(e) => {
              e.stopPropagation()
              select(`light:${g.id}`)
            }}
          >
            <mesh position={[0, 0.3, 0]}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.6, 4]} />
              <meshBasicMaterial color="#4b4a45" />
            </mesh>
            <mesh castShadow>
              <cylinderGeometry args={[0.05, 0.095, 0.045, 32]} />
              <meshStandardMaterial color="#2e302d" roughness={0.5} metalness={0.4} emissive={SELECT_COLOR} emissiveIntensity={selected ? 0.5 : 0} />
            </mesh>
            <mesh position={[0, -0.0235, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.088, 32]} />
              <meshBasicMaterial color={on ? color : '#77756e'} toneMapped={!on} />
            </mesh>
            {on && (
              <spotLight
                position={[0, -0.03, 0]}
                angle={0.85}
                penumbra={0.8}
                distance={2.4}
                decay={1.2}
                color={color}
                intensity={0.4 + 5 * visualLight(g.ppfd)}
              />
            )}
          </group>
        )
      })}
    </group>
  )
}
