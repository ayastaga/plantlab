import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { MEDIA, MEDIUM_IDS } from '../sim/media'
import { POT_MATERIALS } from '../sim/pots'
import { useHidden, useLab, useSelected, useSnapshot } from '../store/useLab'
import { mulberry32 } from './leafGeometry'
import { SELECT_COLOR, mediumRadius, potDims, potRadiusAt, type PotDims } from './util'

const PROFILE_STEPS = 5

function potGeometry(d: PotDims, material: string): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)]
  // a thick collar, the signature of a clay pot
  const rimBand = material === 'glass' || material === 'fabric' ? 0 : d.wall * 1.1
  for (let i = 0; i <= PROFILE_STEPS; i++) {
    const t = i / PROFILE_STEPS
    let r = potRadiusAt(d, t)
    if (rimBand && t > 0.7) r += rimBand
    if (rimBand && i > 0 && t > 0.7 && (i - 1) / PROFILE_STEPS <= 0.7) pts.push(new THREE.Vector2(r - rimBand, (t - 0.06) * d.height))
    pts.push(new THREE.Vector2(r, t * d.height))
  }
  // over the rim and down the inside to the floor
  const top = potRadiusAt(d, 1) + rimBand
  pts.push(new THREE.Vector2(top - d.wall * 0.3, d.height + d.wall * 0.25))
  pts.push(new THREE.Vector2(top - rimBand - d.wall, d.height))
  for (let i = PROFILE_STEPS - 1; i >= 1; i--) {
    const t = i / PROFILE_STEPS
    pts.push(new THREE.Vector2(Math.max(0.002, potRadiusAt(d, t) - d.wall), Math.max(d.wall, t * d.height)))
  }
  pts.push(new THREE.Vector2(0, d.wall))
  return new THREE.LatheGeometry(pts, d.segments)
}

/** The medium as a solid plug that fits inside the pot wall, so it reads correctly through glass or with the pot hidden. */
function plugGeometry(d: PotDims): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, d.wall * 1.05)]
  const steps = 3
  for (let i = 0; i <= steps; i++) {
    const y = d.wall * 1.05 + (i / steps) * (d.fillY - d.wall * 1.05)
    pts.push(new THREE.Vector2(Math.max(0.002, potRadiusAt(d, y / d.height) - d.wall * 1.08), y))
  }
  pts.push(new THREE.Vector2(0, d.fillY))
  return new THREE.LatheGeometry(pts, d.segments)
}

export { potGeometry, plugGeometry }

export function Pot() {
  const pot = useLab((s) => s.experiment.config.pot)
  const select = useLab((s) => s.select)
  const hidden = useHidden('pot')
  const selected = useSelected('pot')
  // seeing into the pot matters when the user is inspecting what is inside it
  const xray = useLab((s) => s.selection === 'roots' || s.selection === 'medium')

  const d = potDims(pot)
  const mat = POT_MATERIALS[pot.material]
  const geometry = useMemo(() => potGeometry(d, pot.material), [pot.shape, pot.heightCm, pot.widthCm, pot.material])
  useEffect(() => () => geometry.dispose(), [geometry])

  const saucer = useMemo(() => {
    const r = potRadiusAt(d, 0) * 1.22
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(r * 0.92, 0),
      new THREE.Vector2(r, 0.016),
      new THREE.Vector2(r - 0.004, 0.016),
      new THREE.Vector2(r * 0.9, 0.005),
      new THREE.Vector2(0, 0.005),
    ]
    return new THREE.LatheGeometry(pts, d.segments)
  }, [pot.shape, pot.widthCm])
  useEffect(() => () => saucer.dispose(), [saucer])

  if (hidden) return null
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select('pot')
  }
  const glass = mat.transparent
  const opacity = xray ? 0.22 : glass ? 0.32 : 1
  const lift = pot.drainageHoles ? 0.006 : 0

  return (
    <group onClick={onClick}>
      <mesh geometry={geometry} position={[0, lift, 0]} rotation={[0, d.twist, 0]} castShadow={!glass} receiveShadow renderOrder={2}>
        <meshStandardMaterial roughness={0.8}
          color={pot.color}
          transparent={opacity < 1}
          opacity={opacity}
          depthWrite={opacity >= 1}
          side={opacity < 1 ? THREE.DoubleSide : THREE.FrontSide}
          emissive={SELECT_COLOR}
          emissiveIntensity={selected ? 0.28 : 0}
        />
      </mesh>
      {/* a saucer is the visible sign that this pot drains */}
      {pot.drainageHoles && (
        <mesh geometry={saucer} rotation={[0, d.twist, 0]} castShadow receiveShadow>
          <meshStandardMaterial roughness={0.8} color={pot.color} emissive={SELECT_COLOR} emissiveIntensity={selected ? 0.28 : 0} />
        </mesh>
      )}
    </group>
  )
}

const MAX_PARTICLES = 1100

export function Medium() {
  const pot = useLab((s) => s.experiment.config.pot)
  const medium = useLab((s) => s.experiment.config.medium)
  const select = useLab((s) => s.select)
  const hidden = useHidden('medium')
  const selected = useSelected('medium')
  const snap = useSnapshot()

  const d = potDims(pot)
  const lift = pot.drainageHoles ? 0.006 : 0
  const radius = mediumRadius(d)
  const wet = THREE.MathUtils.clamp(snap.moisture, 0, 1)
  const wetQ = Math.round(wet * 16) / 16
  const mixKey = MEDIUM_IDS.map((id) => medium.mix[id]).join(',')

  const plug = useMemo(() => plugGeometry(d), [pot.shape, pot.heightCm, pot.widthCm])
  useEffect(() => () => plug.dispose(), [plug])

  // base colour: the volume-weighted blend of what is in the mix, darker when wet
  const baseColor = useMemo(() => {
    const c = new THREE.Color(0, 0, 0)
    let total = 0
    for (const id of MEDIUM_IDS) {
      const f = medium.mix[id]
      if (!f) continue
      const col = new THREE.Color(MEDIA[id].color).lerp(new THREE.Color(MEDIA[id].wetColor), wetQ)
      c.r += col.r * f
      c.g += col.g * f
      c.b += col.b * f
      total += f
    }
    return total ? c.multiplyScalar(1 / total) : new THREE.Color('#4a3526')
  }, [mixKey, wetQ])

  // visible particles on the surface, in proportion to the mix
  const particles = useMemo(() => {
    const rand = mulberry32(5150)
    const area = Math.PI * radius * radius
    const items: { x: number; y: number; z: number; s: [number, number, number]; rot: [number, number, number]; id: (typeof MEDIUM_IDS)[number]; shade: number }[] = []
    const total = MEDIUM_IDS.reduce((s, id) => s + medium.mix[id], 0) || 1
    for (const id of MEDIUM_IDS) {
      const frac = medium.mix[id] / total
      if (!frac) continue
      const p = MEDIA[id].particle
      // fewer, larger lumps than the real particle size: readable at a glance
      const footprint = Math.PI * p.size * p.size * 5
      const count = Math.min(MAX_PARTICLES * frac + 20, Math.round(((area * frac) / footprint) * 1.25 * p.density))
      for (let i = 0; i < count; i++) {
        const r = Math.sqrt(rand()) * (radius - p.size * 0.8)
        const a = rand() * Math.PI * 2
        const sz = p.size * 1.9 * (0.7 + rand() * 0.6)
        items.push({
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: sz * (p.round ? 0.25 : 0.1) + rand() * p.size * (p.round ? 0.9 : 0.3),
          s: p.round ? [sz, sz, sz] : [sz * (0.8 + rand() * 0.9), sz * (0.35 + rand() * 0.4), sz * (0.7 + rand() * 0.7)],
          rot: [rand() * 3, rand() * 3, rand() * 3],
          id,
          shade: 0.82 + rand() * 0.36,
        })
      }
    }
    return items
  }, [mixKey, radius])

  const instanced = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 })
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, particles.length))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    particles.forEach((p, i) => {
      e.set(p.rot[0], p.rot[1], p.rot[2])
      q.setFromEuler(e)
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(...p.s))
      mesh.setMatrixAt(i, m)
    })
    mesh.count = particles.length
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }, [particles])
  useEffect(
    () => () => {
      instanced.geometry.dispose()
      ;(instanced.material as THREE.Material).dispose()
      instanced.dispose()
    },
    [instanced],
  )
  useMemo(() => {
    const c = new THREE.Color()
    particles.forEach((p, i) => {
      c.set(MEDIA[p.id].color).lerp(new THREE.Color(MEDIA[p.id].wetColor), wetQ * 0.85).multiplyScalar(p.shade)
      instanced.setColorAt(i, c)
    })
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
  }, [instanced, particles, wetQ])
  const im = instanced.material as THREE.MeshStandardMaterial
  im.emissive.set(SELECT_COLOR)
  im.emissiveIntensity = selected ? 0.22 : 0

  if (hidden) return null
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select('medium')
  }
  const sh = medium.semiHydro
  const waterTop = d.wall + (d.height - d.wall) * (sh.reservoirPct / 100) * Math.max(0.02, snap.reservoir)

  return (
    <group position={[0, lift, 0]} onClick={onClick}>
      <mesh geometry={plug} rotation={[0, d.twist, 0]} receiveShadow>
        <meshStandardMaterial roughness={0.8} color={baseColor} emissive={SELECT_COLOR} emissiveIntensity={selected ? 0.22 : 0} />
      </mesh>
      <group position={[0, d.fillY, 0]} scale={pot.shape === 'square' ? [1.18, 1, 1.18] : 1}>
        <primitive object={instanced} />
      </group>
      {/* semi-hydro reservoir: a water column whose height follows the simulated level */}
      {sh.enabled && snap.reservoir > 0.01 && (
        <mesh position={[0, (d.wall + waterTop) / 2, 0]} rotation={[0, d.twist, 0]} renderOrder={1}>
          <cylinderGeometry
            args={[
              (potRadiusAt(d, waterTop / d.height) - d.wall * 0.6) * 1.0,
              (potRadiusAt(d, d.wall / d.height) - d.wall * 0.6) * 1.0,
              Math.max(0.002, waterTop - d.wall),
              d.segments,
            ]}
          />
          <meshStandardMaterial color="#5f9fc4" transparent opacity={0.55} roughness={0.1} depthWrite={false} flatShading={pot.shape === 'square'} />
        </mesh>
      )}
    </group>
  )
}
