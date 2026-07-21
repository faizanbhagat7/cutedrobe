'use client'
// Elegant ambient backdrop: a few slow-drifting gold motes + a soft vignette.
// Replaces the old childish falling-petals look. Kept the filename so imports stay valid.
import { useEffect, useRef } from 'react'

export default function Petals() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!, ctx = c.getContext('2d')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0, w = 0, h = 0
    const dots = Array.from({ length: 26 }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.5 + Math.random() * 1.6,
      s: 0.02 + Math.random() * 0.06,
      a: 0.05 + Math.random() * 0.18,
      d: Math.random() * Math.PI * 2,
    }))
    const resize = () => { w = c.width = innerWidth; h = c.height = innerHeight }
    resize(); addEventListener('resize', resize)
    let t = 0
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      t += 0.005
      for (const p of dots) {
        if (!reduce) { p.y -= p.s / 100; p.x += Math.sin(t + p.d) * 0.0004 }
        if (p.y < -0.02) p.y = 1.02
        const x = p.x * w, y = p.y * h
        const g = ctx.createRadialGradient(x, y, 0, x, y, p.r * 6)
        g.addColorStop(0, `rgba(176,141,79,${p.a})`)   // antique gold
        g.addColorStop(1, 'rgba(176,141,79,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, p.r * 6, 0, Math.PI * 2); ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} className="fixed inset-0 -z-0 h-full w-full" style={{ pointerEvents: 'none' }} />
}
