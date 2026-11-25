import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useHidden, useLab, useSelected, useSnapshot } from '../store/useLab'
import { mulberry32 } from './leafGeometry'
import { SELECT_COLOR, potDims } from './util'

export const BACKGROUND = '#7cc8ff'
const MAX_MIST = 420

function softSprite(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/**
 * Visual feedback for relative humidity: drifting mist whose amount follows
 * the simulated RH, plus distance haze. Purely cosmetic; the simulation reads
 * the RH number.
 */
export function Atmosphere() {
  const snap = useSnapshot()
  const enabled = useLab((s) => s.view.atmosphere)
  const hidden = useHidden('atmosphere')
  const selected = useSelected('atmosphere')
  const { scene } = useThree()
  const rh = snap.env.rh
  const amount = THREE.MathUtils.clamp((rh - 30) / 65, 0, 1)

  const { geometry, base } = useMemo(() => {
    const rand = mulberry32(77)
    const pos = new Float32Array(MAX_MIST * 3)
    for (let i = 0; i < MAX_MIST; i++) {
      const a = rand() * Math.PI * 2
      const r = 0.2 + Math.sqrt(rand()) * 0.95
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = 0.05 + rand() * 0.95
      pos[i * 3 + 2] = Math.sin(a) * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geometry: g, base: pos.slice() }
  }, [])
  const sprite = useMemo(softSprite, [])
  const material = useRef<THREE.PointsMaterial>(null)
  useEffect(
    () => () => {
      geometry.dispose()
      sprite.dispose()
    },
    [geometry, sprite],
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < MAX_MIST; i++) {
      pos.setX(i, base[i * 3] + Math.sin(t * 0.11 + i * 1.7) * 0.09)
      pos.setY(i, 0.05 + ((base[i * 3 + 1] + t * 0.012 * (0.5 + (i % 5) * 0.2)) % 0.95))
      pos.setZ(i, base[i * 3 + 2] + Math.cos(t * 0.09 + i * 2.3) * 0.09)
    }
    pos.needsUpdate = true
  })

  // haze thickens with humidity
  useEffect(() => {
    const on = enabled && !hidden
    scene.fog = on && amount > 0.45 ? new THREE.Fog('#b9c8e6', THREE.MathUtils.lerp(9, 2.2, amount), THREE.MathUtils.lerp(30, 8, amount)) : null
    return () => {
      scene.fog = null
    }
  }, [scene, amount, enabled, hidden])

  if (!enabled || hidden) return null
  geometry.setDrawRange(0, Math.round(MAX_MIST * amount * amount))
  return (
    <points geometry={geometry} raycast={() => null} renderOrder={5}>
      <pointsMaterial
        ref={material}
        map={sprite}
        size={0.16 + 0.12 * amount}
        sizeAttenuation
        transparent
        depthWrite={false}
        color={selected ? '#f3e2bd' : '#ffffff'}
        opacity={0.1 + 0.3 * amount + (selected ? 0.12 : 0)}
      />
    </points>
  )
}

/** Small studio instruments. Each one is a clickable handle for an environment setting. */
export function Instruments() {
  const config = useLab((s) => s.experiment.config)
  const select = useLab((s) => s.select)
  const show = useLab((s) => s.view.props)
  const snap = useSnapshot()
  const tempHidden = useHidden('temperature')
  const atmoHidden = useHidden('atmosphere')
  const waterHidden = useHidden('watering')
  const tempSel = useSelected('temperature')
  const atmoSel = useSelected('atmosphere')
  const waterSel = useSelected('watering')
  if (!show) return null

  const d = potDims(config.pot)
  const reach = Math.max(0.36, d.radius + 0.2)
  const t = snap.env.tMeanC
  const level = THREE.MathUtils.clamp((t + 5) / 50, 0.03, 1)
  const mercury = new THREE.Color('#3f7fb5').lerp(new THREE.Color('#c8452f'), THREE.MathUtils.clamp((t - 8) / 24, 0, 1))
  const pick = (id: string) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    select(id)
  }
  const glow = (on: boolean) => ({ emissive: SELECT_COLOR, emissiveIntensity: on ? 0.45 : 0 })
  const humidifierOn = config.humidity.humidifier
  const semiHydro = config.medium.semiHydro.enabled

  return (
    <group>
      {/* thermometer: the column height is the simulated air temperature */}
      {!tempHidden && (
        <group position={[reach, 0, reach * 0.55]} onClick={pick('temperature')}>
          <mesh position={[0, 0.008, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, 0.016, 24]} />
            <meshStandardMaterial color="#d8d3c7" roughness={0.6} {...glow(tempSel)} />
          </mesh>
          <mesh position={[0, 0.15, -0.006]} castShadow>
            <boxGeometry args={[0.034, 0.27, 0.005]} />
            <meshStandardMaterial color="#f4f1ea" roughness={0.7} {...glow(tempSel)} />
          </mesh>
          <mesh position={[0, 0.035, 0]}>
            <sphereGeometry args={[0.011, 16, 12]} />
            <meshStandardMaterial color={mercury} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.04 + (0.225 * level) / 2, 0]}>
            <cylinderGeometry args={[0.0042, 0.0042, 0.225 * level, 10]} />
            <meshStandardMaterial color={mercury} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.155, 0]}>
            <cylinderGeometry args={[0.0075, 0.0075, 0.24, 12]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.28} roughness={0.05} depthWrite={false} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[0.011, 0.04 + 0.225 * (i / 5), -0.003]}>
              <boxGeometry args={[0.008, 0.0012, 0.001]} />
              <meshBasicMaterial color="#8a8578" />
            </mesh>
          ))}
        </group>
      )}

      {/* humidifier / hygrometer puck */}
      {!atmoHidden && (
        <group position={[-reach, 0, reach * 0.65]} onClick={pick('atmosphere')}>
          <mesh position={[0, 0.045, 0]} castShadow>
            <cylinderGeometry args={[0.042, 0.05, 0.09, 28]} />
            <meshStandardMaterial color="#e9e5db" roughness={0.45} {...glow(atmoSel)} />
          </mesh>
          <mesh position={[0, 0.093, 0]}>
            <cylinderGeometry args={[0.02, 0.03, 0.008, 20]} />
            <meshStandardMaterial color={humidifierOn ? '#2f5d3a' : '#8d897e'} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.03, 0.0495]}>
            <circleGeometry args={[0.006, 12]} />
            <meshBasicMaterial color={humidifierOn ? '#7fd08a' : '#9a968b'} toneMapped={false} />
          </mesh>
          {humidifierOn && <Plume />}
        </group>
      )}

      {/* watering can (or a jug of nutrient solution in semi-hydro) */}
      {!waterHidden && (
        <group position={[reach * 1.05, 0, -reach * 0.5]} rotation={[0, 2.4, 0]} onClick={pick('watering')}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.058, 0.12, 28]} />
            <meshStandardMaterial color={semiHydro ? '#7fa9a0' : '#557a5c'} roughness={0.45} metalness={0.25} {...glow(waterSel)} />
          </mesh>
          <mesh position={[0.085, 0.085, 0]} rotation={[0, 0, -0.95]} castShadow>
            <cylinderGeometry args={[0.007, 0.012, 0.15, 12]} />
            <meshStandardMaterial color={semiHydro ? '#7fa9a0' : '#557a5c'} roughness={0.45} metalness={0.25} {...glow(waterSel)} />
          </mesh>
          <mesh position={[-0.058, 0.075, 0]} rotation={[0, 0, 0]} castShadow>
            <torusGeometry args={[0.038, 0.005, 8, 20, Math.PI]} />
            <meshStandardMaterial color="#3d5942" roughness={0.5} metalness={0.25} {...glow(waterSel)} />
          </mesh>
        </group>
      )}
    </group>
  )
}

function Plume() {
  const ref = useRef<THREE.Group>(null)
  const sprite = useMemo(softSprite, [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.children.forEach((c, i) => {
      const k = (clock.elapsedTime * 0.35 + i / 6) % 1
      c.position.set(Math.sin(i * 2 + k * 3) * 0.02 * k, 0.1 + k * 0.32, Math.cos(i * 3 + k * 2) * 0.02 * k)
      c.scale.setScalar(0.04 + k * 0.16)
      ;((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.55 * (1 - k)
    })
  })
  return (
    <group ref={ref}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <sprite key={i} raycast={() => null}>
          <spriteMaterial map={sprite} transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}
