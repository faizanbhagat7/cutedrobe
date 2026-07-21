'use client'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

function Field() {
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const petals = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        pos: [(((i * 97) % 100) / 100 - 0.5) * 26, (((i * 53) % 100) / 100 - 0.5) * 16, (((i * 31) % 100) / 100 - 0.5) * 8] as [number, number, number],
        rot: [((i * 13) % 30) / 10, ((i * 7) % 30) / 10, ((i * 5) % 30) / 10] as [number, number, number],
        speed: 0.15 + (((i * 41) % 100) / 100) * 0.35,
        drift: (((i * 61) % 100) / 100) * 6.28,
        color: [0xe9c9bc, 0xd9c7a9, 0xc98d77, 0xf0e2cf][i % 4],
      })),
    []
  )
  useFrame((state) => {
    const t = state.clock.elapsedTime
    meshes.current.forEach((m, i) => {
      if (!m) return
      const p = petals[i]
      m.position.y -= p.speed * 0.012
      m.position.x += Math.sin(t * 0.4 + p.drift) * 0.004
      m.rotation.x += 0.004
      m.rotation.z += 0.003
      if (m.position.y < -9) m.position.y = 9
    })
  })
  return (
    <>
      {petals.map((p, i) => (
        <mesh key={i} ref={(el) => { meshes.current[i] = el }} position={p.pos} rotation={p.rot} scale={[1, 0.34, 0.75]}>
          <sphereGeometry args={[0.5, 10, 8]} />
          <meshStandardMaterial color={p.color} roughness={0.85} transparent opacity={0.7} />
        </mesh>
      ))}
    </>
  )
}

export default function Petals() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ opacity: 0.85, zIndex: 0 }}>
      <Canvas camera={{ position: [0, 0, 14], fov: 55 }}>
        <ambientLight intensity={1.1} color={0xfff5e8} />
        <directionalLight position={[4, 6, 6]} intensity={0.8} color={0xffe8d0} />
        <Field />
      </Canvas>
    </div>
  )
}
