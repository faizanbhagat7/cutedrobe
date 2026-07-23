import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Cuts out just the outfit using Photoroom's fashion-tuned Remove Background API.
// The API key never leaves the server.
export async function POST(req: NextRequest) {
  const key = process.env.PHOTOROOM_API_KEY
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 500 })

  // The sandbox tier stamps a watermark on every result. Rather than ship
  // watermarked images (or strip them, which would breach Photoroom's terms),
  // we decline here so the client uses the local model — free, unlimited and
  // genuinely watermark-free. Swap in a paid LIVE key to enable Photoroom.
  if (key.startsWith('sandbox_')) {
    return NextResponse.json({ error: 'sandbox_skipped' }, { status: 409 })
  }

  const inForm = await req.formData()
  const file = inForm.get('image')
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file' }, { status: 400 })

  const out = new FormData()
  out.append('image_file', file)
  out.append('format', 'png')
  out.append('crop', 'true') // tight-frame the outfit for clean cards

  const res = await fetch('https://sdk.photoroom.com/v1/segment', {
    method: 'POST',
    headers: { 'x-api-key': key },
    body: out,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json({ error: 'photoroom_failed', status: res.status, detail }, { status: 502 })
  }

  const buf = await res.arrayBuffer()
  return new NextResponse(buf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
}
