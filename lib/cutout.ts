/* Outfit cut-out pipeline — precision-first.

   Design rule: NEVER destroy garment pixels. Earlier versions used an
   aggressive alpha floor (0.42) plus despeckling, which erased soft fabric
   edges and light garments — that is what produced "half the outfit".
   This version only removes what is confidently background, and every
   destructive step has a guard that reverts if it removed too much.
*/

export type CutoutOptions = {
  size?: number
  padding?: number
  onStage?: (stage: 'preparing' | 'segmenting' | 'refining' | 'framing') => void
}

const SIZE = 1400
const PADDING = 0.05
/** Only pixels below this are treated as background. Deliberately low. */
const CLEAR_BELOW = 0.06
/** Pixels above this are snapped to fully opaque (kills grey haze). */
const SOLID_ABOVE = 0.92
/** Ignore alpha under this when measuring the subject's bounds. */
const BOUNDS_ALPHA = 24

async function bitmap(src: Blob) { return await createImageBitmap(src) }

/** Downscale huge phone photos; keeps segmentation fast without losing detail. */
async function prepare(file: File, maxEdge = 1800): Promise<Blob> {
  const bmp = await bitmap(file)
  const longest = Math.max(bmp.width, bmp.height)
  if (longest <= maxEdge) { bmp.close(); return file }
  const scale = maxEdge / longest
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return await c.convertToBlob({ type: 'image/png' })
}

/** How much of the image is visible (0-1). Used as a safety measure. */
function coverage(data: Uint8ClampedArray): number {
  let on = 0
  const px = data.length / 4
  for (let i = 3; i < data.length; i += 4) if (data[i] > BOUNDS_ALPHA) on++
  return on / px
}

/**
 * Gentle alpha clean-up: clears only near-zero alpha (true background haze)
 * and solidifies near-opaque pixels. Everything in between is LEFT ALONE so
 * soft fabric edges survive intact.
 */
function cleanAlpha(data: Uint8ClampedArray) {
  const lo = CLEAR_BELOW * 255, hi = SOLID_ABOVE * 255
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i]
    if (a <= lo) data[i] = 0
    else if (a >= hi) data[i] = 255
  }
}

/** Bounding box of the subject. */
function boundsOf(data: Uint8ClampedArray, w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (data[(row + x) * 4 + 3] > BOUNDS_ALPHA) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Trim, centre and pad onto a square canvas — with guards against bad crops. */
async function frame(cut: Blob, size: number, padding: number): Promise<Blob> {
  const bmp = await bitmap(cut)
  const work = new OffscreenCanvas(bmp.width, bmp.height)
  const wctx = work.getContext('2d')!
  wctx.drawImage(bmp, 0, 0)
  bmp.close()

  const img = wctx.getImageData(0, 0, work.width, work.height)
  const before = coverage(img.data)
  cleanAlpha(img.data)
  const after = coverage(img.data)

  // GUARD 1: if clean-up removed more than 8% of the subject, discard it
  // and keep the raw segmentation instead. Precision over prettiness.
  if (before > 0 && after < before * 0.92) {
    wctx.drawImage(await bitmap(cut), 0, 0)
  } else {
    wctx.putImageData(img, 0, 0)
  }

  const live = wctx.getImageData(0, 0, work.width, work.height)
  let box = boundsOf(live.data, work.width, work.height)

  // GUARD 2: reject nonsense bounding boxes (tiny, or a sliver) — these are
  // the classic "cropped in half" symptom. Fall back to the full frame.
  if (box) {
    const areaRatio = (box.w * box.h) / (work.width * work.height)
    const aspect = box.w / box.h
    if (areaRatio < 0.02 || aspect > 12 || aspect < 1 / 12) box = null
  }
  if (!box) box = { x: 0, y: 0, w: work.width, h: work.height }

  // GUARD 3: never crop tighter than the subject — expand slightly so no
  // edge pixel is ever clipped.
  const bleed = Math.round(Math.max(box.w, box.h) * 0.01)
  box = {
    x: Math.max(0, box.x - bleed),
    y: Math.max(0, box.y - bleed),
    w: Math.min(work.width - Math.max(0, box.x - bleed), box.w + bleed * 2),
    h: Math.min(work.height - Math.max(0, box.y - bleed), box.h + bleed * 2),
  }

  const out = new OffscreenCanvas(size, size)
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  const inner = size * (1 - padding * 2)
  // contain: the whole subject always fits, never cropped
  const scale = Math.min(inner / box.w, inner / box.h)
  const dw = box.w * scale, dh = box.h * scale
  octx.drawImage(work, box.x, box.y, box.w, box.h, (size - dw) / 2, (size - dh) / 2, dw, dh)
  return await out.convertToBlob({ type: 'image/png' })
}

/** Photo in → precise, framed outfit cut-out out. */
export async function refineOutfit(file: File, opts: CutoutOptions = {}): Promise<Blob> {
  const size = opts.size ?? SIZE
  const padding = opts.padding ?? PADDING
  const stage = opts.onStage ?? (() => {})

  stage('preparing')
  const prepped = await prepare(file)

  stage('segmenting')
  const { removeBackground } = await import('@imgly/background-removal')
  const cut = await removeBackground(prepped, {
    model: 'isnet',
    output: { format: 'image/png', quality: 1 },
  })

  stage('refining')
  stage('framing')
  try {
    return await frame(cut, size, padding)
  } catch {
    // GUARD 4: if framing fails for any reason, return the raw cut-out
    // rather than a broken image.
    return cut
  }
}
