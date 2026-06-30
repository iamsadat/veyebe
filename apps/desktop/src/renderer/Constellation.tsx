/// <reference types="@react-three/fiber" />
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Float, Html, Line, MeshDistortMaterial, OrbitControls, Sparkles, Stars } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { memo, useLayoutEffect, useMemo, useRef, type ComponentType, type ReactNode } from 'react'
import * as THREE from 'three'
import type { Feature, FeatureState } from '../shared/contracts'

type Vec3 = [number, number, number]

// ponytail: adaptive DPR — never render above the GPU's comfort zone on hi-DPI panels
const getAdaptiveDPR = (): [number, number] => {
  if (typeof window === 'undefined') return [1, 2]
  const dpr = window.devicePixelRatio || 1
  return [Math.min(dpr, 1.5), Math.min(dpr, 2)]
}

// drei/postprocessing components cast to lean prop types (React 19 + drei JSX typing workaround)
const SparklesFx = Sparkles as ComponentType<{ count?: number; scale?: number | Vec3; size?: number; speed?: number; color?: string; opacity?: number; noise?: number }>
const StarsFx = Stars as ComponentType<{ radius?: number; depth?: number; count?: number; factor?: number; saturation?: number; fade?: boolean; speed?: number }>
const FloatFx = Float as ComponentType<{ speed?: number; rotationIntensity?: number; floatIntensity?: number; floatingRange?: [number, number]; children?: ReactNode }>
const LineFx = Line as ComponentType<{ points: Array<Vec3 | THREE.Vector3>; color?: string; transparent?: boolean; opacity?: number; lineWidth?: number; dashed?: boolean; dashScale?: number }>
const OrbitControlsFx = OrbitControls as ComponentType<{ makeDefault?: boolean; enablePan?: boolean; enableDamping?: boolean; dampingFactor?: number; minDistance?: number; maxDistance?: number; autoRotate?: boolean; autoRotateSpeed?: number }>
const BillboardFx = Billboard as ComponentType<{ position?: Vec3; children?: ReactNode }>
const HtmlFx = Html as ComponentType<{ center?: boolean; distanceFactor?: number; style?: React.CSSProperties; children?: ReactNode }>
const DistortFx = MeshDistortMaterial as ComponentType<{ color?: string; emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number; distort?: number; speed?: number; radius?: number }>
const EffectComposerFx = EffectComposer as ComponentType<{ children?: ReactNode; multisampling?: number }>
const BloomFx = Bloom as ComponentType<{ intensity?: number; luminanceThreshold?: number; luminanceSmoothing?: number; mipmapBlur?: boolean; radius?: number }>

const colors: Record<FeatureState, string> = { proposed: '#96a0ad', planned: '#7c8cff', active: '#b778ff', needs_verification: '#ffb75e', verified: '#61e6b5', blocked: '#ff657d', parked: '#596372' }

const Node = memo(({ feature, selected, still, architecture, index, onSelect }: { feature: Feature; selected: boolean; still: boolean; architecture: boolean; index: number; onSelect: () => void }) => {
  const ref = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const born = useRef(0)
  const color = colors[feature.state]
  const delay = index * 0.07

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g || still) return
    const t = clock.elapsedTime
    if (born.current === 0) born.current = t
    // staggered scale-in entrance (ease-out cubic)
    const a = Math.min(1, Math.max(0, (t - born.current - delay) / 0.6))
    g.scale.setScalar(1 - Math.pow(1 - a, 3))
    // selected halo breathes
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(t * 3) * 0.07)
    // blocked node — angry shimmer
    if (ring.current) {
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.abs(Math.sin(t * 6 + index)) * 0.45
      ring.current.scale.setScalar(1.35 + Math.sin(t * 6 + index) * 0.05)
    }
  })

  const inner = (
    <group ref={ref} scale={still ? 1 : 0.0001}>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect() }} scale={selected ? 1.18 : 1}>
        <sphereGeometry args={[0.34, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 2.8 : 0.75} roughness={0.22} toneMapped={false} />
      </mesh>
      {feature.state === 'blocked' && <mesh ref={ring} scale={1.35}><torusGeometry args={[0.36, 0.022, 8, 48]} /><meshBasicMaterial color="#ff657d" transparent opacity={0.75} toneMapped={false} /></mesh>}
      {selected && <BillboardFx><mesh ref={halo}><ringGeometry args={[0.5, 0.58, 56]} /><meshBasicMaterial color={color} transparent opacity={0.65} side={THREE.DoubleSide} toneMapped={false} /></mesh></BillboardFx>}
      {feature.evidence.map((item, i) => { const ang = (i / Math.max(1, feature.evidence.length)) * Math.PI * 2; return <mesh key={item.id} position={[Math.cos(ang) * 0.62, Math.sin(ang) * 0.62, 0]}><sphereGeometry args={[0.055, 12, 12]} /><meshBasicMaterial color={item.verified ? '#d9fff0' : '#667080'} toneMapped={!item.verified} /></mesh> })}
      <BillboardFx position={[0, -0.62, 0]}><HtmlFx center distanceFactor={8} style={{ pointerEvents: 'none' }}><div className={`space-label ${selected ? 'selected' : ''}`}><span>{feature.title}</span>{architecture && <small>{feature.evidence.filter(e => e.kind === 'code_entity').length} modules</small>}</div></HtmlFx></BillboardFx>
    </group>
  )

  return <group position={feature.position}>{still ? inner : <FloatFx speed={1.4} rotationIntensity={0.25} floatIntensity={0.5} floatingRange={[-0.06, 0.06]}>{inner}</FloatFx>}</group>
})
Node.displayName = 'Node'

const Core = memo(({ still }: { still: boolean }) => {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { if (!still && ref.current) ref.current.rotation.y = clock.elapsedTime * 0.13 })
  const core = (
    <>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.86, 5]} />
        <DistortFx color="#fbf7ff" emissive="#8750ff" emissiveIntensity={1.8} roughness={0.3} metalness={0.1} distort={still ? 0.22 : 0.34} speed={still ? 0 : 1.6} radius={1} />
      </mesh>
      <mesh scale={1.55}><icosahedronGeometry args={[0.86, 1]} /><meshBasicMaterial color="#7d4dff" transparent opacity={0.06} wireframe toneMapped={false} /></mesh>
      <pointLight color="#a06dff" intensity={17} distance={9} />
      <SparklesFx count={26} scale={2.6} size={2} speed={still ? 0 : 0.16} color="#d8c5ff" opacity={0.7} />
    </>
  )
  return still ? <group>{core}</group> : <FloatFx speed={1} rotationIntensity={0.2} floatIntensity={0.4}>{core}</FloatFx>
})
Core.displayName = 'Core'

// Energy pulses travelling source -> target along each dependency link (instanced, zero per-frame allocation)
const PulseFlow = memo(({ links, still }: { links: Array<[Vec3, Vec3]>; still: boolean }) => {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const segs = useMemo(() => links.map(([a, b], i) => ({ a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), phase: (i * 0.137) % 1 })), [links])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < segs.length; i++) { const s = segs[i]; if (!s) continue; dummy.position.copy(s.a); dummy.scale.setScalar(0.0001); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix) }
    m.instanceMatrix.needsUpdate = true
  }, [segs, dummy])

  useFrame(({ clock }) => {
    const m = ref.current
    if (!m || still) return
    const time = clock.elapsedTime
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]
      if (!s) continue
      const t = (time * 0.32 + s.phase) % 1
      tmp.copy(s.a).lerp(s.b, t)
      dummy.position.copy(tmp)
      dummy.scale.setScalar(0.045 + Math.sin(t * Math.PI) * 0.06)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  if (!segs.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, segs.length]} visible={!still} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial color="#ead9ff" transparent opacity={0.95} toneMapped={false} />
    </instancedMesh>
  )
})
PulseFlow.displayName = 'PulseFlow'

// Cinematic ease of the orbit target toward the selected node (user drag still works via OrbitControls)
const CameraRig = memo(({ target, still }: { target: Vec3; still: boolean }) => {
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null
  const desired = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (still || !controls) return
    desired.set(target[0], target[1], target[2])
    controls.target.lerp(desired, 0.045)
    controls.update()
  })
  return null
})
CameraRig.displayName = 'CameraRig'

export const Constellation = memo(({ features, selectedId, onSelect, architecture, reducedMotion }: { features: Feature[]; selectedId?: string; onSelect: (feature: Feature) => void; architecture: boolean; reducedMotion: boolean }) => {
  const links = useMemo(() => features.flatMap(feature => feature.dependencies.map(dep => [features.find(f => f.id === dep)?.position ?? [0, 0, 0], feature.position] as [Vec3, Vec3])), [features])
  const dpr = useMemo(() => getAdaptiveDPR(), [])
  const focus = useMemo<Vec3>(() => features.find(f => f.id === selectedId)?.position ?? [0, 0, 0], [features, selectedId])

  return <Canvas camera={{ position: [0, 0, 8.5], fov: 48 }} dpr={dpr} gl={{ antialias: true, alpha: true }} aria-label="Interactive project constellation">
    <fog attach="fog" args={['#0a0912', 9, 26]} />
    <ambientLight intensity={0.35} />
    <StarsFx radius={60} depth={40} count={2200} factor={3.4} saturation={0} fade speed={reducedMotion ? 0 : 0.4} />
    <Core still={reducedMotion} />
    {features.map(feature => <LineFx key={`core-${feature.id}`} points={[[0, 0, 0], feature.position]} color={colors[feature.state]} transparent opacity={architecture ? 0.28 : 0.12} lineWidth={architecture ? 1.2 : 0.6} />)}
    {links.map((points, i) => <LineFx key={i} points={points} color="#c9b8ff" transparent opacity={0.35} dashed dashScale={7} lineWidth={1} />)}
    <PulseFlow links={links} still={reducedMotion} />
    {features.map((feature, i) => <Node key={feature.id} feature={feature} index={i} selected={feature.id === selectedId} still={reducedMotion} architecture={architecture} onSelect={() => onSelect(feature)} />)}
    <OrbitControlsFx makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={6} maxDistance={11} autoRotate={!reducedMotion} autoRotateSpeed={0.12} />
    <CameraRig target={focus} still={reducedMotion} />
    <EffectComposerFx>
      <BloomFx intensity={1.15} luminanceThreshold={0.18} luminanceSmoothing={0.85} mipmapBlur radius={0.75} />
    </EffectComposerFx>
  </Canvas>
})
Constellation.displayName = 'Constellation'
