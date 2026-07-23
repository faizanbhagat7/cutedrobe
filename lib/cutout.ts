/* Outfit cut-out pipeline — precision-first, artifact-free.

   The failure this fixes: faint leftover fragments (ghost UI text, background
   scraps, stray specks) were counted as part of the subject, which inflated the
   bounding box — so the garment came out small, off-centre and floating.

   Fix: after segmentation we keep only the *real* garment blob(s) via
   connected-component analysis, erase everything else, and measure bounds from
   confidently-solid pixels only.
*/

export type CutoutOptions = {
  size?: number
  padding?: number
  onStage?: (stage: 'preparing' | 'segmenting' | 'refining' | 'framing') => void
}

const SIZE = 1400
const PADDING = 0.05
/** background haze cleared below this */
const CLEAR_BELOW = 0.06
/** snapped to opaque above this */
const SOLID_ABOVE = 0.92
/** a pixel only counts as "subject" above this — high, to ignore ghosts */
const SOLID_ALPHA = 150
/** components smaller than this share of the largest are discarded */
const KEEP_RATIO = 0.12
/** mask resolution used for component analysis (speed) */
const MASK_MAX = 360

async function bitmap(src: Blob) { return await createImageBitmap(src) }

async function prepare(file: File, maxEdge = 1800): Promise<Blob> {
  const bmp = await bitmap(file)
  const longest = Math.max(bmp.width, bmp.height)
  if (longest <= maxEdge) { bmp.close(); return file }
  const s = maxEdge / longest
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s)
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close()
  return await c.convertToBlob({ type: 'image/png' })
}

function cleanAlpha(d: Uint8ClampedArray) {
  const lo = CLEAR_BELOW * 255, hi = SOLID_ABOVE * 255
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i]
    if (a <= lo) d[i] = 0
    else if (a >= hi) d[i] = 255
  }
}

/**
 * Keep only the genuine garment. Builds a low-res binary mask, labels connected
 * regions, keeps the largest plus any region at least KEEP_RATIO of it (so a
 * detached sleeve or belt survives), and erases all remaining debris.
 * Returns false if the result looks unsafe, so the caller can skip it.
 */
function keepMainSubject(d: Uint8ClampedArray, w: number, h: number): boolean {
  const scale = Math.min(1, MASK_MAX / Math.max(w, h))
  const mw = Math.max(1, Math.round(w * scale)), mh = Math.max(1, Math.round(h * scale))
  const mask = new Uint8Array(mw * mh)
  for (let my = 0; my < mh; my++) {
    const sy = Math.min(h - 1, Math.floor(my / scale))
    for (let mx = 0; mx < mw; mx++) {
      const sx = Math.min(w - 1, Math.floor(mx / scale))
      mask[my * mw + mx] = d[(sy * w + sx) * 4 + 3] >= SOLID_ALPHA ? 1 : 0
    }
  }

  // label components (iterative flood fill, 4-connected)
  const label = new Int32Array(mw * mh).fill(0)
  const sizes: number[] = [0]
  const stack: number[] = []
  let next = 1
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || label[p]) continue
    const id = next++; let count = 0
    stack.push(p); label[p] = id
    while (stack.length) {
      const q = stack.pop()!; count++
      const x = q % mw, y = (q / mw) | 0
      if (x > 0 && mask[q - 1] && !label[q - 1]) { label[q - 1] = id; stack.push(q - 1) }
      if (x < mw - 1 && mask[q + 1] && !label[q + 1]) { label[q + 1] = id; stack.push(q + 1) }
      if (y > 0 && mask[q - mw] && !label[q - mw]) { label[q - mw] = id; stack.push(q - mw) }
      if (y < mh - 1 && mask[q + mw] && !label[q + mw]) { label[q + mw] = id; stack.push(q + mw) }
    }
    sizes[id] = count
  }
  if (next <= 1) return false

  let biggest = 0
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[biggest || 1]) biggest = i
  const largest = sizes[biggest]
  if (!largest) return false
  const keep = new Set<number>()
  for (let i = 1; i < sizes.length; i++) if (sizes[i] >= largest * KEEP_RATIO) keep.add(i)

  // safety: if we'd delete most of the visible subject, don't
  let kept = 0, total = 0
  for (let i = 1; i < sizes.length; i++) { total += sizes[i]; if (keep.has(i)) kept += sizes[i] }
  if (total === 0 || kept / total < 0.5) return false

  // erase debris in the full-res image
  for (let y = 0; y < h; y++) {
    const my = Math.min(mh - 1, Math.floor(y * scale))
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3
      if (!d[i]) continue
      const mx = Math.min(mw - 1, Math.floor(x * scale))
      if (!keep.has(label[my * mw + mx])) d[i] = 0
    }
  }
  return true
}

/** Bounds measured only from confidently-solid pixels. */
function boundsOf(d: Uint8ClampedArray, w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (d[(row + x) * 4 + 3] >= SOLID_ALPHA) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

async function frame(cut: Blob, size: number, padding: number): Promise<Blob> {
  const bmp = await bitmap(cut)
  const work = new OffscreenCanvas(bmp.width, bmp.height)
  const wctx = work.getContext('2d')!
  wctx.drawImage(bmp, 0, 0); bmp.close()

  const img = wctx.getImageData(0, 0, work.width, work.height)
  cleanAlpha(img.data)
  keepMainSubject(img.data, work.width, work.height)
  wctx.putImageData(img, 0, 0)

  let box = boundsOf(img.data, work.width, work.height)
  if (box) {
    const areaRatio = (box.w * box.h) / (work.width * work.height)
    const aspect = box.w / box.h
    if (areaRatio < 0.01 || aspect > 14 || aspect < 1 / 14) box = null
  }
  if (!box) box = { x: 0, y: 0, w: work.width, h: work.height }

  const bleed = Math.round(Math.max(box.w, box.h) * 0.015)
  const bx = Math.max(0, box.x - bleed), by = Math.max(0, box.y - bleed)
  box = { x: bx, y: by, w: Math.min(work.width - bx, box.w + bleed * 2), h: Math.min(work.height - by, box.h + bleed * 2) }

  const out = new OffscreenCanvas(size, size)
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high'
  const inner = size * (1 - padding * 2)
  const scale = Math.min(inner / box.w, inner / box.h)
  const dw = box.w * scale, dh = box.h * scale
  octx.drawImage(work, box.x, box.y, box.w, box.h, (size - dw) / 2, (size - dh) / 2, dw, dh)
  return await out.convertToBlob({ type: 'image/png' })
}

export async function refineOutfit(file: File, opts: CutoutOptions = {}): Promise<Blob> {
  const size = opts.size ?? SIZE
  const padding = opts.padding ?? PADDING
  const stage = opts.onStage ?? (() => {})
  stage('preparing')
  const prepped = await prepare(file)
  stage('segmenting')
  const { removeBackground } = await import('@imgly/background-removal')
  const cut = await removeBackground(prepped, { model: 'isnet', output: { format: 'image/png', quality: 1 } })
  stage('refining'); stage('framing')
  try { return await frame(cut, size, padding) } catch { return cut }
}
