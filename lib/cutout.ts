/* Refined outfit-cutout pipeline.
   Goals: precise edges, no watermark, and uniform, gallery-grade cards.

   Stages:
   1. downscale huge phone photos (speed, without losing edge detail)
   2. segment with the high-accuracy isnet model (free, local, watermark-free)
   3. clean the alpha edge (kills the faded halo / semi-transparent fringe)
   4. auto-trim empty space, centre, and pad onto a square canvas
   5. export a crisp PNG at a consistent size
*/

export type CutoutOptions = {
  /** final square canvas size in px */
  size?: number
  /** padding inside the canvas, as a fraction of size */
  padding?: number
  /** alpha below this is erased; above `solidAt` is made fully opaque */
  alphaFloor?: number
  solidAt?: number
  onStage?: (stage: 'preparing' | 'segmenting' | 'refining' | 'framing') => void
}

const DEFAULTS: Required<Omit<CutoutOptions, 'onStage'>> = {
  size: 1200,
  padding: 0.06,
  alphaFloor: 0.42,
  solidAt: 0.88,
}

/** Load a File/Blob into an ImageBitmap (fast, no DOM). */
async function toBitmap(src: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(src)
}

/** Downscale very large images so segmentation stays fast and sharp. */
async function prepare(file: File, maxEdge = 1600): Promise<Blob> {
  const bmp = await toBitmap(file)
  const longest = Math.max(bmp.width, bmp.height)
  if (longest <= maxEdge) { bmp.close(); return file }
  const scale = maxEdge / longest
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return await c.convertToBlob({ type: 'image/png' })
}

/**
 * Clean the alpha channel.
 * The "half the outfit fades away" problem is semi-transparent fringe pixels.
 * We push low alpha to 0 and high alpha to 255, then keep a narrow ramp
 * between so edges stay smooth instead of jagged.
 */
function refineAlpha(data: Uint8ClampedArray, floor: number, solid: number) {
  const lo = floor * 255
  const hi = solid * 255
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i]
    if (a <= lo) { data[i] = 0; continue }
    if (a >= hi) { data[i] = 255; continue }
    // smoothstep across the remaining band
    const t = (a - lo) / (hi - lo)
    data[i] = Math.round(255 * (t * t * (3 - 2 * t)))
  }
}

/** Remove isolated specks left behind by segmentation. */
function despeckle(data: Uint8ClampedArray, w: number, h: number) {
  const alpha = new Uint8ClampedArray(w * h)
  for (let p = 0; p < w * h; p++) alpha[p] = data[p * 4 + 3]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      if (!alpha[p]) continue
      let neighbours = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          if (alpha[p + dy * w + dx] > 8) neighbours++
        }
      if (neighbours <= 2) data[p * 4 + 3] = 0
    }
  }
}

/** Find the bounding box of everything still visible. */
function boundsOf(data: Uint8ClampedArray, w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
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

/**
 * Turn a raw cut-out into a uniform, gallery-grade image:
 * trimmed of empty space, centred, padded, on a square transparent canvas.
 * This is what makes every card in the closet line up beautifully.
 */
async function frame(cut: Blob, size: number, padding: number, alphaFloor: number, solidAt: number): Promise<Blob> {
  const bmp = await toBitmap(cut)
  const work = new OffscreenCanvas(bmp.width, bmp.height)
  const wctx = work.getContext('2d')!
  wctx.drawImage(bmp, 0, 0)
  bmp.close()

  const img = wctx.getImageData(0, 0, work.width, work.height)
  refineAlpha(img.data, alphaFloor, solidAt)
  despeckle(img.data, work.width, work.height)
  wctx.putImageData(img, 0, 0)

  const box = boundsOf(img.data, work.width, work.height) ?? { x: 0, y: 0, w: work.width, h: work.height }

  const out = new OffscreenCanvas(size, size)
  const octx = out.getContext('2d')!
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'

  const inner = size * (1 - padding * 2)
  const scale = Math.min(inner / box.w, inner / box.h)
  const dw = box.w * scale
  const dh = box.h * scale
  octx.drawImage(work, box.x, box.y, box.w, box.h, (size - dw) / 2, (size - dh) / 2, dw, dh)

  return await out.convertToBlob({ type: 'image/png' })
}

/**
 * Main entry: photo in, refined outfit cut-out out.
 * Uses the local isnet model — high accuracy, free, and no watermark.
 */
export async function refineOutfit(file: File, opts: CutoutOptions = {}): Promise<Blob> {
  const o = { ...DEFAULTS, ...opts }
  const stage = opts.onStage ?? (() => {})

  stage('preparing')
  const prepped = await prepare(file)

  stage('segmenting')
  const { removeBackground } = await import('@imgly/background-removal')
  const cut = await removeBackground(prepped, {
    // isnet is the high-accuracy model — noticeably better edges on clothing
    model: 'isnet',
    output: { format: 'image/png', quality: 1 },
  })

  stage('refining')
  stage('framing')
  return await frame(cut, o.size, o.padding, o.alphaFloor, o.solidAt)
}
