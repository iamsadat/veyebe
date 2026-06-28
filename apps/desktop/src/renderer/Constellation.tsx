/// <reference types="@react-three/fiber" />
import { Canvas, useFrame } from '@react-three/fiber'
import { Billboard, Html, Line, OrbitControls, Sparkles } from '@react-three/drei'
import { useMemo, useRef, type ComponentType } from 'react'
import * as THREE from 'three'
import type { Feature, FeatureState } from '../shared/contracts'

const SparklesFx = Sparkles as ComponentType<{ count?: number; scale?: number; size?: number; speed?: number; color?: string }>
const LineFx = Line as ComponentType<{ points: Array<[number, number, number] | THREE.Vector3>; color?: string; transparent?: boolean; opacity?: number; lineWidth?: number; dashed?: boolean; dashScale?: number }>
const OrbitControlsFx = OrbitControls as ComponentType<{ enablePan?: boolean; minDistance?: number; maxDistance?: number; autoRotate?: boolean; autoRotateSpeed?: number }>
const BillboardFx = Billboard as ComponentType<{ position?: [number, number, number]; children?: React.ReactNode }>
const HtmlFx = Html as ComponentType<{ center?: boolean; distanceFactor?: number; style?: React.CSSProperties; children?: React.ReactNode }>

const colors: Record<FeatureState, string> = { proposed: '#96a0ad', planned: '#7c8cff', active: '#b778ff', needs_verification: '#ffb75e', verified: '#61e6b5', blocked: '#ff657d', parked: '#596372' }

function Core({ still }: { still: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { if (!still && ref.current) ref.current.rotation.y = clock.elapsedTime * .13 })
  return <group><mesh ref={ref}><icosahedronGeometry args={[.86, 4]} /><meshStandardMaterial color="#fbf7ff" emissive="#8750ff" emissiveIntensity={1.7} roughness={.32} /></mesh><pointLight color="#a06dff" intensity={17} distance={9} /><SparklesFx count={22} scale={2.4} size={2} speed={still ? 0 : .16} color="#d8c5ff" /></group>
}

function Node({ feature, selected, still, architecture, onSelect }: { feature: Feature; selected: boolean; still: boolean; architecture: boolean; onSelect: () => void }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (!still && ref.current) ref.current.position.y = feature.position[1] + Math.sin(clock.elapsedTime * .55 + feature.position[0]) * .05 })
  const color = colors[feature.state]
  return <group ref={ref} position={feature.position}>
    <mesh onClick={(event) => { event.stopPropagation(); onSelect() }} scale={selected ? 1.18 : 1}>
      <sphereGeometry args={[.34, 32, 32]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 2 : .65} roughness={.25} />
    </mesh>
    {feature.state === 'blocked' && <mesh scale={1.35}><torusGeometry args={[.36, .025, 8, 48]} /><meshBasicMaterial color="#ff657d" transparent opacity={.75} /></mesh>}
    {feature.evidence.map((item, index) => { const a = index / Math.max(1, feature.evidence.length) * Math.PI * 2; return <mesh key={item.id} position={[Math.cos(a) * .62, Math.sin(a) * .62, 0]}><sphereGeometry args={[.055, 12, 12]} /><meshBasicMaterial color={item.verified ? '#d9fff0' : '#667080'} /></mesh> })}
    <BillboardFx position={[0, -.62, 0]}><HtmlFx center distanceFactor={8} style={{ pointerEvents: 'none' }}><div className={`space-label ${selected ? 'selected' : ''}`}><span>{feature.title}</span>{architecture && <small>{feature.evidence.filter(e => e.kind === 'code_entity').length} modules</small>}</div></HtmlFx></BillboardFx>
  </group>
}

export function Constellation({ features, selectedId, onSelect, architecture, reducedMotion }: { features: Feature[]; selectedId?: string; onSelect: (feature: Feature) => void; architecture: boolean; reducedMotion: boolean }) {
  const links = useMemo(() => features.flatMap(feature => feature.dependencies.map(dep => [features.find(f => f.id === dep)?.position ?? [0, 0, 0], feature.position] as [[number, number, number], [number, number, number]])), [features])
  return <Canvas camera={{ position: [0, 0, 8.5], fov: 48 }} dpr={[1, 1.7]} gl={{ antialias: true, alpha: true }} aria-label="Interactive project constellation">
    <ambientLight intensity={.35} /><Core still={reducedMotion} />
    {features.map(feature => <LineFx key={`core-${feature.id}`} points={[[0,0,0], feature.position]} color={colors[feature.state]} transparent opacity={architecture ? .28 : .12} lineWidth={architecture ? 1.2 : .6} />)}
    {links.map((points, index) => <LineFx key={index} points={points} color="#c9b8ff" transparent opacity={.35} dashed dashScale={7} lineWidth={1} />)}
    {features.map(feature => <Node key={feature.id} feature={feature} selected={feature.id === selectedId} still={reducedMotion} architecture={architecture} onSelect={() => onSelect(feature)} />)}
    <OrbitControlsFx enablePan={false} minDistance={6} maxDistance={11} autoRotate={!reducedMotion} autoRotateSpeed={.12} />
  </Canvas>
}
