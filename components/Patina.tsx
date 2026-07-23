'use client'
/* Vitiligo-inspired backdrop.

   The motif: soft, organic patches of light resting on a warmer ground —
   the same quiet contrast that makes vitiligo skin beautiful. Nothing
   clinical, nothing literal. Just two tones meeting in irregular, gentle
   shapes that drift and breathe, celebrating patterned skin as elegance.
*/
import { useEffect, useRef } from 'react'

type Patch = { x: number; y: number; r: number; seed: number; drift: number; tone: number }

export default function Patina() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0, w = 0, h = 0, t = 0

    const patches: Patch[] = Array.from({ length: 9 }, (_, i) => ({
      x: (i * 0.37 + 0.1) % 1,
      y: (i * 0.53 + 0.05) % 1,
      r: 0.12 + ((i * 7) % 10) / 42,
      seed: i * 1.7,
      drift: 0.00006 + ((i * 3) % 5) / 90000,
      tone: i % 3,
    }))

    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1)
      w = innerWidth; h = innerHeight
      c.width = w * dpr; c.height = h * dpr
      c.style.width = w + 'px'; c.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize(); addEventListener('resize', resize)

    /* an irregular, soft-edged blob — never a circle */
    const blob = (cx: number, cy: number, r: number, seed: number, time: number) => {
      ctx.beginPath()
      const steps = 48
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2
        const wobble =
          Math.sin(a * 3 + seed) * 0.13 +
          Math.sin(a * 5 - seed * 1.3) * 0.07 +
          Math.sin(a * 2 + time * 0.5 + seed) * 0.05
        const rad = r * (1 + wobble)
        const x = cx + Math.cos(a) * rad
        const y = cy + Math.sin(a) * rad * 0.86
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.closePath()
    }

    const TONES = [
      'rgba(255,253,248,0.55)',  // ivory light patch
      'rgba(247,240,229,0.45)',  // pale champagne
      'rgba(214,196,166,0.20)',  // faint gold shadow
    ]

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      if (!reduce) t += 0.004
      const base = Math.min(w, h)
      for (const p of patches) {
        const cx = (p.x + Math.sin(t * 0.3 + p.seed) * 0.012) * w
        const cy = ((p.y + (reduce ? 0 : t * p.drift * 900)) % 1.2 - 0.1) * h
        const r = p.r * base
        ctx.save()
        ctx.filter = 'blur(26px)'
        ctx.fillStyle = TONES[p.tone]
        blob(cx, cy, r, p.seed, t)
        ctx.fill()
        ctx.restore()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} className="fixed inset-0 -z-0" style={{ pointerEvents: 'none' }} aria-hidden />
}
