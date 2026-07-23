'use client'
/* Framing step.
   The single biggest quality win: let her draw a box around the garment
   before segmentation runs. Mirror selfies contain faces, hands, mirrors and
   rooms — no model can reliably guess which part is "the outfit". Framing
   removes that guesswork entirely.
*/
import { useEffect, useRef, useState } from 'react'

type Box = { x: number; y: number; w: number; h: number }

export default function Cropper({
  file, onConfirm, onCancel,
}: { file: File; onConfirm: (cropped: File) => void; onCancel: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('')
  const [box, setBox] = useState<Box | null>(null)
  const drag = useRef<{ sx: number; sy: number } | null>(null)

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  /* start with a sensible default: the middle 80% */
  const onLoad = () => {
    const el = imgRef.current!
    const w = el.clientWidth, h = el.clientHeight
    setBox({ x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 })
  }

  const pos = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e: React.PointerEvent) => {
    const p = pos(e)
    drag.current = { sx: p.x, sy: p.y }
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return
    const p = pos(e)
    const { sx, sy } = drag.current
    setBox({ x: Math.min(sx, p.x), y: Math.min(sy, p.y), w: Math.abs(p.x - sx), h: Math.abs(p.y - sy) })
  }
  const up = () => { drag.current = null }

  const confirm = async () => {
    const el = imgRef.current!
    if (!box || box.w < 12 || box.h < 12) { onConfirm(file); return }
    const scaleX = el.naturalWidth / el.clientWidth
    const scaleY = el.naturalHeight / el.clientHeight
    const sx = Math.max(0, box.x * scaleX)
    const sy = Math.max(0, box.y * scaleY)
    const sw = Math.min(el.naturalWidth - sx, box.w * scaleX)
    const sh = Math.min(el.naturalHeight - sy, box.h * scaleY)

    const c = document.createElement('canvas')
    c.width = Math.round(sw); c.height = Math.round(sh)
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(el, sx, sy, sw, sh, 0, 0, c.width, c.height)
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
    onConfirm(new File([blob], 'framed.png', { type: 'image/png' }))
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(36,28,35,.72)] px-5 backdrop-blur-md">
      <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-[rgba(214,196,166,.5)] bg-[var(--paper)] shadow-[0_50px_100px_-35px_rgba(36,28,35,.7)]">
        <div className="h-px w-full gold-line" />
        <div className="px-8 pt-7 pb-5 text-center">
          <div className="eyebrow mb-2">Step one</div>
          <h3 className="font-display text-[26px] text-[var(--plum)]">Frame the garment</h3>
          <p className="mx-auto mt-2 max-w-[360px] text-[13.5px] leading-relaxed text-[var(--taupe)]">
            Drag a box around the clothing only — leave out face, hands and the room. This is what makes the cut-out clean.
          </p>
        </div>

        <div ref={wrapRef} className="relative mx-8 mb-6 touch-none select-none overflow-hidden rounded-2xl bg-[#EFE7DB]"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={url} alt="" onLoad={onLoad} draggable={false}
            className="block max-h-[46vh] w-full object-contain" />
          {box && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-[rgba(36,28,35,.5)]"
                style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${box.x}px ${box.y}px,${box.x}px ${box.y + box.h}px,${box.x + box.w}px ${box.y + box.h}px,${box.x + box.w}px ${box.y}px,${box.x}px ${box.y}px)` }} />
              <div className="pointer-events-none absolute border border-[var(--gold)] shadow-[0_0_0_1px_rgba(253,251,247,.5)]"
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
                {[['-top-1 -left-1'], ['-top-1 -right-1'], ['-bottom-1 -left-1'], ['-bottom-1 -right-1']].map(([c], i) => (
                  <span key={i} className={`absolute h-2 w-2 rounded-full bg-[var(--gold)] ${c}`} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-8 pb-8">
          <button onClick={onCancel}
            className="flex-1 rounded-full border border-[rgba(214,196,166,.9)] py-3 text-[11.5px] uppercase tracking-[.2em] text-[var(--taupe)] transition-all hover:border-[var(--plum)] hover:text-[var(--plum)]">
            Cancel
          </button>
          <button onClick={confirm}
            className="flex-1 rounded-full bg-[var(--plum)] py-3 text-[11.5px] uppercase tracking-[.2em] text-[#F1E7D8] transition-all hover:bg-[var(--wine)]">
            Use this frame
          </button>
        </div>
      </div>
    </div>
  )
}
