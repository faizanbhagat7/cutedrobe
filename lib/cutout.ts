/* Outfit cut-out — safety first.

   History of this file: aggressive thresholds twice destroyed real garments
   (a pale blouse on a pale wall was erased, leaving only a hand). The lesson:
   post-processing must NEVER be able to delete the subject.

   Order of operations now:
     1. she frames the garment (Cropper) — removes face/hands/room up front
     2. Photoroom segments it (fashion-tuned, best on garment-on-person)
     3. local model as fallback if Photoroom is unavailable
     4. post-processing that only trims transparent margins and removes
        specks smaller than 2% of the subject — with a hard revert guard
*/

export type CutoutOptions = {
  size?: number
  padding?: number
  onStage?: (s: 'preparing' | 'segmenting' | 'refining' | 'framing') => void
}

const SIZE = 1400
const PADDING = 0.06
/** only near-invisible haze is cleared — real fabric is never touched */
const CLEAR_BELOW = 0.05
/** a pixel counts toward bounds above this */
const BOUNDS_ALPHA = 40
/** specks below this share of the largest blob are removed (debris only) */
const SPECK_RATIO = 0.02
const MASK_MAX = 320

async function bmp(b: Blob) { return await createImageBitmap(b) }

async function downscale(file: File, maxEdge = 1800): Promise<Blob> {
  const im = await bmp(file)
  const longest = Math.max(im.width, im.height)
  if (longest <= maxEdge) { im.close(); return file }
  const s = maxEdge / longest
  const w = Math.round(im.width * s), h = Math.round(im.height * s)
  const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(im, 0, 0, w, h); im.close()
  return await c.convertToBlob({ type: 'image/png' })
}

function visible(d: Uint8ClampedArray) {
  let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > BOUNDS_ALPHA) n++
  return n
}

/** Remove only tiny disconnected specks. Never large regions. */
function despeck(d: Uint8ClampedArray, w: number, h: number) {
  const sc = Math.min(1, MASK_MAX / Math.max(w, h))
  const mw = Math.max(1, Math.round(w * sc)), mh = Math.max(1, Math.round(h * sc))
  const mask = new Uint8Array(mw * mh)
  for (let my = 0; my < mh; my++) {
    const sy = Math.min(h - 1, Math.floor(my / sc))
    for (let mx = 0; mx < mw; mx++) {
      const sx = Math.min(w - 1, Math.floor(mx / sc))
      mask[my * mw + mx] = d[(sy * w + sx) * 4 + 3] > BOUNDS_ALPHA ? 1 : 0
    }
  }
  const label = new Int32Array(mw * mh), sizes = [0], st: number[] = []
  let next = 1
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || label[p]) continue
    const id = next++; let c = 0; st.push(p); label[p] = id
    while (st.length) {
      const q = st.pop()!; c++
      const x = q % mw, y = (q / mw) | 0
      if (x > 0 && mask[q - 1] && !label[q - 1]) { label[q - 1] = id; st.push(q - 1) }
      if (x < mw - 1 && mask[q + 1] && !label[q + 1]) { label[q + 1] = id; st.push(q + 1) }
      if (y > 0 && mask[q - mw] && !label[q - mw]) { label[q - mw] = id; st.push(q - mw) }
      if (y < mh - 1 && mask[q + mw] && !label[q + mw]) { label[q + mw] = id; st.push(q + mw) }
    }
    sizes[id] = c
  }
  if (next <= 2) return               // one blob: nothing to clean
  let big = 1
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[big]) big = i
  const floor = sizes[big] * SPECK_RATIO
  const drop = new Set<number>()
  for (let i = 1; i < sizes.length; i++) if (i !== big && sizes[i] < floor) drop.add(i)
  if (!drop.size) return
  for (let y = 0; y < h; y++) {
    const my = Math.min(mh - 1, Math.floor(y * sc))
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3
      if (!d[i]) continue
      const mx = Math.min(mw - 1, Math.floor(x * sc))
      if (drop.has(label[my * mw + mx])) d[i] = 0
    }
  }
}

function boundsOf(d: Uint8ClampedArray, w: number, h: number) {
  let a = w, b = h, c = -1, e = -1
  for (let y = 0; y < h; y++) {
    const r = y * w
    for (let x = 0; x < w; x++) {
      if (d[(r + x) * 4 + 3] > BOUNDS_ALPHA) {
        if (x < a) a = x; if (x > c) c = x
        if (y < b) b = y; if (y > e) e = y
      }
    }
  }
  return c < 0 ? null : { x: a, y: b, w: c - a + 1, h: e - b + 1 }
}

async function frame(cut: Blob, size: number, padding: number): Promise<Blob> {
  const im = await bmp(cut)
  const work = new OffscreenCanvas(im.width, im.height)
  const wctx = work.getContext('2d')!
  wctx.drawImage(im, 0, 0); im.close()

  const img = wctx.getImageData(0, 0, work.width, work.height)
  const before = visible(img.data)

  const lo = CLEAR_BELOW * 255
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] <= lo) img.data[i] = 0
  despeck(img.data, work.width, work.height)

  // HARD GUARD: if post-processing removed more than 10% of the subject,
  // throw it away and keep the untouched segmentation.
  if (before > 0 && visible(img.data) < before * 0.9) {
    wctx.drawImage(await bmp(cut), 0, 0)
  } else {
    wctx.putImageData(img, 0, 0)
  }

  const live = wctx.getImageData(0, 0, work.width, work.height)
  let box = boundsOf(live.data, work.width, work.height)
  if (box) {
    const area = (box.w * box.h) / (work.width * work.height)
    const asp = box.w / box.h
    if (area < 0.01 || asp > 14 || asp < 1 / 14) box = null
  }
  if (!box) box = { x: 0, y: 0, w: work.width, h: work.height }

  const bleed = Math.round(Math.max(box.w, box.h) * 0.02)
  const bx = Math.max(0, box.x - bleed), by = Math.max(0, box.y - bleed)
  box = { x: bx, y: by, w: Math.min(work.width - bx, box.w + bleed * 2), h: Math.min(work.height - by, box.h + bleed * 2) }

  const out = new OffscreenCanvas(size, size)
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high'
  const inner = size * (1 - padding * 2)
  const s = Math.min(inner / box.w, inner / box.h)
  const dw = box.w * s, dh = box.h * s
  octx.drawImage(work, box.x, box.y, box.w, box.h, (size - dw) / 2, (size - dh) / 2, dw, dh)
  return await out.convertToBlob({ type: 'image/png' })
}

export async function refineOutfit(file: File, opts: CutoutOptions = {}): Promise<Blob> {
  const size = opts.size ?? SIZE
  const padding = opts.padding ?? PADDING
  const stage = opts.onStage ?? (() => {})

  stage('preparing')
  const prepped = await downscale(file)

  stage('segmenting')
  let cut: Blob | null = null
  try {
    // Photoroom first: fashion-tuned, far better on garment-worn-by-person
    const fd = new FormData()
    fd.append('image', new File([prepped], 'in.png', { type: 'image/png' }))
    const res = await fetch('/api/cutout', { method: 'POST', body: fd })
    if (res.ok) cut = await res.blob()
  } catch { /* fall through */ }

  if (!cut || cut.size < 1000) {
    const { removeBackground } = await import('@imgly/background-removal')
    cut = await removeBackground(prepped, { model: 'isnet', output: { format: 'image/png', quality: 1 } })
  }

  stage('refining'); stage('framing')
  try { return await frame(cut, size, padding) } catch { return cut }
}
