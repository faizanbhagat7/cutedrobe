'use client'
/* Review & refine.

   No segmentation model is perfect on arbitrary photos — a hand inside a
   sleeve, UI text in a screenshot, a mirror edge. Rather than pretend
   otherwise, this step shows the result and lets her brush away anything
   left over. Two seconds of touch-up guarantees a clean garment every time,
   whatever the colour, shade or brightness.
*/
import { useEffect, useRef, useState } from 'react'

export default function Refine({
  cut, onDone, onCancel,
}: { cut: Blob; onDone: (finished: Blob) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(46)
  const [busy, setBusy] = useState(true)
  const painting = useRef(false)
  const history = useRef<ImageData[]>([])
  const dims = useRef({ w: 0, h: 0 })

  useEffect(() => {
    let dead = false
    ;(async () => {
      const bmp = await createImageBitmap(cut)
      if (dead) return
      const c = canvasRef.current!
      c.width = bmp.width; c.height = bmp.height
      dims.current = { w: bmp.width, h: bmp.height }
      const ctx = c.getContext('2d')!
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
      history.current = [ctx.getImageData(0, 0, c.width, c.height)]
      setBusy(false)
    })()
    return () => { dead = true }
  }, [cut])

  const at = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }

  const erase = (x: number, y: number) => {
    const ctx = canvasRef.current!.getContext('2d')!
    const scale = canvasRef.current!.width / (canvasRef.current!.getBoundingClientRect().width || 1)
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(x, y, (size / 2) * scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const down = (e: React.PointerEvent) => {
    if (busy) return
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    history.current.push(ctx.getImageData(0, 0, c.width, c.height))
    if (history.current.length > 12) history.current.shift()
    painting.current = true
    const p = at(e); erase(p.x, p.y)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const move = (e: React.PointerEvent) => { if (painting.current) { const p = at(e); erase(p.x, p.y) } }
  const up = () => { painting.current = false }

  const undo = () => {
    const prev = history.current.pop()
    if (!prev) return
    canvasRef.current!.getContext('2d')!.putImageData(prev, 0, 0)
  }

  /* trim transparent margins so the saved image is tight and centred */
  const finish = async () => {
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    const img = ctx.getImageData(0, 0, c.width, c.height)
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (img.data[(y * c.width + x) * 4 + 3] > 40) {
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
      }
    }
    const box = maxX < 0 ? { x: 0, y: 0, w: c.width, h: c.height }
      : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }

    const S = 1400, pad = 0.06
    const out = document.createElement('canvas')
    out.width = S; out.height = S
    const octx = out.getContext('2d')!
    octx.imageSmoothingQuality = 'high'
    const inner = S * (1 - pad * 2)
    const s = Math.min(inner / box.w, inner / box.h)
    const dw = box.w * s, dh = box.h * s
    octx.drawImage(c, box.x, box.y, box.w, box.h, (S - dw) / 2, (S - dh) / 2, dw, dh)
    const blob: Blob = await new Promise((r) => out.toBlob((b) => r(b!), 'image/png'))
    onDone(blob)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(36,28,35,.74)] px-5 backdrop-blur-md">
      <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-[rgba(214,196,166,.5)] bg-[var(--paper)] shadow-[0_50px_100px_-35px_rgba(36,28,35,.7)]">
        <div className="h-px w-full gold-line" />
        <div className="px-8 pt-7 pb-4 text-center">
          <div className="eyebrow mb-2">Step two</div>
          <h3 className="font-display text-[26px] text-[var(--plum)]">Perfect the garment</h3>
          <p className="mx-auto mt-2 max-w-[380px] text-[13.5px] leading-relaxed text-[var(--taupe)]">
            Brush away anything that isn&apos;t the clothing — a hand, a stray edge, leftover text.
          </p>
        </div>

        <div className="mx-8 mb-4 overflow-hidden rounded-2xl border border-[rgba(214,196,166,.45)]"
          style={{ background: 'repeating-conic-gradient(#F2ECE1 0 25%, #FDFBF7 0 50%) 50%/22px 22px' }}>
          <canvas ref={canvasRef}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="block max-h-[44vh] w-full touch-none cursor-crosshair object-contain"
            style={{ objectFit: 'contain' }} />
        </div>

        <div className="mx-8 mb-5 flex items-center gap-4">
          <span className="meta shrink-0">Brush</span>
          <input type="range" min={14} max={130} value={size} onChange={(e) => setSize(+e.target.value)}
            className="h-[2px] flex-1 appearance-none rounded-full bg-[var(--sand)] accent-[var(--gold)]" />
          <button onClick={undo} className="meta shrink-0 transition-colors hover:text-[var(--plum)]">Undo</button>
        </div>

        <div className="flex gap-3 px-8 pb-8">
          <button onClick={onCancel}
            className="flex-1 rounded-full border border-[rgba(214,196,166,.9)] py-3 text-[11.5px] uppercase tracking-[.2em] text-[var(--taupe)] transition-all hover:border-[var(--plum)] hover:text-[var(--plum)]">
            Start over
          </button>
          <button onClick={finish} disabled={busy}
            className="flex-1 rounded-full bg-[var(--plum)] py-3 text-[11.5px] uppercase tracking-[.2em] text-[#F1E7D8] transition-all hover:bg-[var(--wine)] disabled:opacity-50">
            Save to closet
          </button>
        </div>
      </div>
    </div>
  )
}
