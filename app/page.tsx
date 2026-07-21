'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase, Cloth, ItemStat, WearEntry, Outfit } from '@/lib/supabase'

const Petals = dynamic(() => import('@/components/Petals'), { ssr: false })

const EMOJI: Record<string, string> = { Top: '👚', Bottom: '👖', Dress: '👗', Sleepwear: '🌙', Outerwear: '🧥', Shoes: '👟', Accessory: '💍' }
const CATS = ['Top', 'Bottom', 'Dress', 'Outerwear', 'Sleepwear', 'Shoes', 'Accessory']

/* cute copy */
const CUTE_SAVE = [
  'Tucked into her closet, neat as a bow 🎀', 'Folded with love and put away 🌸',
  'One more treasure for the collection ✨', 'Hung up and looking lovely 🧺', 'Saved — she has wonderful taste 💛',
]
const CUTE_PROCESS = [
  'Snipping away the background…', 'Pressing out the little wrinkles…', 'Smoothing the seams…',
  'Dusting off the lint…', 'Finding the perfect hanger…', 'Catching the light just right…',
]
const CUTE_TIPS = [
  '“When in doubt, add a belt.” — every grandmother, ever',
  'A silk scarf turns plain into parisienne.',
  'Neutrals never argue — beige loves everyone.',
  'One statement piece, everything else kept quiet.',
  'Cuff the jeans, tuck the blouse — instantly put-together.',
  'A little pearl earring fixes almost anything.',
  'Match your shoes to your bag and no one asks questions.',
  'Iron the collar even if nothing else — it shows, darling.',
  'Good posture is the finest accessory of all.',
]
const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

type Tab = 'home' | 'closet' | 'outfits' | 'stylist' | 'journal' | 'insights'

export default function Home() {
  const [tab, setTab] = useState<Tab>('home')
  const [wardrobe, setWardrobe] = useState<Cloth[]>([])
  const [stats, setStats] = useState<ItemStat[]>([])
  const [wearLog, setWearLog] = useState<WearEntry[]>([])
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const toast = useCallback((m: string) => {
    setToastMsg(m); clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 3200)
  }, [])

  const loadAll = useCallback(async () => {
    setLoadErr(null)
    const [cl, st, wh, of] = await Promise.all([
      supabase.from('clothes').select('id,name,category,color,season,style,image_url,is_favorite').eq('archived', false).order('created_at', { ascending: false }),
      supabase.from('item_stats').select('id,name,category,wear_count,last_worn'),
      supabase.from('wear_history').select('id,worn_on,occasion,rating, outfits(name, outfit_items(clothes(name)))').order('worn_on', { ascending: false }).limit(30),
      supabase.from('outfits').select('id,name,occasion,ai_generated, outfit_items(slot, clothes(name,category,image_url))').order('created_at', { ascending: false }),
    ])
    const err = cl.error || st.error || wh.error || of.error
    if (err) { setLoadErr(err.message); return }
    setWardrobe((cl.data as Cloth[]) || [])
    setStats((st.data as ItemStat[]) || [])
    setWearLog((wh.data as unknown as WearEntry[]) || [])
    setOutfits((of.data as unknown as Outfit[]) || [])
  }, [])
  useEffect(() => { loadAll() }, [loadAll])

  const statFor = (id: string) => stats.find((s) => s.id === id) || ({ wear_count: 0, last_worn: null } as ItemStat)

  /* ---- closet ---- */
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const shown = wardrobe
    .filter((w) => filter === 'All' || w.category === filter)
    .filter((w) => !search || [w.name, w.category].join(' ').toLowerCase().includes(search.toLowerCase()))
  const grouped = CATS.map((c) => ({ cat: c, items: shown.filter((w) => w.category === c) })).filter((g) => g.items.length)

  /* ---- add: mandatory photo -> AI cutout ---- */
  const [form, setForm] = useState({ name: '', category: 'Top' })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [phase, setPhase] = useState<'' | 'cutting' | 'uploading'>('')
  const [tick, setTick] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = phase !== ''

  useEffect(() => {
    if (!busy) return
    const id = setInterval(() => setTick((t) => t + 1), 2300)
    return () => clearInterval(id)
  }, [busy])
  const procMsg = CUTE_PROCESS[tick % CUTE_PROCESS.length]
  const tipMsg = CUTE_TIPS[tick % CUTE_TIPS.length]

  const pickFile = (f: File) => { setFile(f); setPreview(URL.createObjectURL(f)) }
  const addItem = async () => {
    if (!file) { toast('An outfit photo is required 📸'); return }
    if (!form.name.trim()) { toast('Give the outfit a name ✏️'); return }
    try {
      setPhase('cutting'); setTick(0)
      let cutout: Blob
      try {
        // 1) Photoroom (fashion-tuned, clean edges) — key stays server-side
        const fd = new FormData(); fd.append('image', file)
        const res = await fetch('/api/cutout', { method: 'POST', body: fd })
        if (!res.ok) throw new Error('photoroom')
        cutout = await res.blob()
      } catch {
        // 2) fallback: in-browser cutter if Photoroom is unreachable / out of credits
        const { removeBackground } = await import('@imgly/background-removal')
        cutout = await removeBackground(file)
      }
      setPhase('uploading')
      const path = `items/${Date.now()}.png`
      const { error: upErr } = await supabase.storage.from('wardrobe').upload(path, cutout, { contentType: 'image/png' })
      if (upErr) throw upErr
      const image_url = supabase.storage.from('wardrobe').getPublicUrl(path).data.publicUrl
      const { error } = await supabase.from('clothes').insert({ name: form.name.trim(), category: form.category, image_url })
      if (error) throw error
      setForm({ name: '', category: 'Top' }); setFile(null); setPreview('')
      if (fileRef.current) fileRef.current.value = ''
      toast(rand(CUTE_SAVE))
      loadAll()
    } catch (e) { toast('Oh no — ' + (e instanceof Error ? e.message : 'something slipped')) }
    setPhase('')
  }
  const toggleFav = async (id: string, val: boolean) => {
    const { error } = await supabase.from('clothes').update({ is_favorite: val }).eq('id', id)
    if (error) toast('Update failed: ' + error.message); else loadAll()
  }
  const archive = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? (history is kept)`)) return
    const { error } = await supabase.from('clothes').update({ archived: true }).eq('id', id)
    if (error) toast('Failed: ' + error.message); else { toast('Gently set aside ☁️'); loadAll() }
  }

  /* ---- outfits + AI generator ---- */
  const [generating, setGenerating] = useState(false)
  const [ofFilter, setOfFilter] = useState<'All' | 'AI' | 'Saved'>('All')
  const shownOutfits = outfits.filter((o) => ofFilter === 'All' || (ofFilter === 'AI' ? o.ai_generated : !o.ai_generated))
  const generateOutfit = async () => {
    if (!wardrobe.some((w) => ['Top', 'Dress'].includes(w.category))) { toast('Add at least one top or dress first 🌷'); return }
    setGenerating(true); setTick(0)
    try {
      const b = wardrobe.filter((w) => w.category === 'Bottom')
      const existing = new Set(outfits.map((o) => o.outfit_items.map((i) => i.clothes?.name).sort().join('|')))
      let best: { top: Cloth; bot: Cloth | null; score: number } | null = null
      for (const d of wardrobe.filter((w) => w.category === 'Dress')) {
        if (existing.has([d.name].sort().join('|'))) continue
        const score = 1.5 + 2 / (1 + statFor(d.id).wear_count) + Math.random() * 0.4
        if (!best || score > best.score) best = { top: d, bot: null, score }
      }
      for (const top of wardrobe.filter((w) => w.category === 'Top')) for (const bot of b) {
        if (existing.has([top.name, bot.name].sort().join('|'))) continue
        const score = 2 + 2 / (1 + statFor(top.id).wear_count) + 1.5 / (1 + statFor(bot.id).wear_count) + Math.random() * 0.4
        if (!best || score > best.score) best = { top, bot, score }
      }
      if (!best) { toast('Every lovely combo is already saved 💫'); setGenerating(false); return }
      const name = best.bot ? `${best.top.name.split(' ')[0]} × ${best.bot.name.split(' ')[0]}` : best.top.name
      const { data: o, error } = await supabase.from('outfits').insert({ name, occasion: 'AI pick', ai_generated: true }).select().single()
      if (error || !o) throw error || new Error('insert failed')
      const items = [{ outfit_id: o.id, clothes_id: best.top.id, slot: best.bot ? 'top' : 'dress' }]
      if (best.bot) items.push({ outfit_id: o.id, clothes_id: best.bot.id, slot: 'bottom' })
      await supabase.from('outfit_items').insert(items)
      toast(`✨ A new look, just for her: ${name}`); setOfFilter('All'); loadAll()
    } catch (e) { toast('Generation failed: ' + (e instanceof Error ? e.message : 'unknown')) }
    setGenerating(false)
  }
  const wearOutfit = async (o: Outfit) => {
    const { error } = await supabase.from('wear_history').insert({ outfit_id: o.id, occasion: 'everyday' })
    if (error) toast('Failed: ' + error.message); else { toast('Noted — worn today & remembered 💾'); loadAll() }
  }
  const deleteOutfit = async (id: string) => {
    if (!confirm('Delete this outfit?')) return
    const { error } = await supabase.from('outfits').delete().eq('id', id)
    if (error) toast('Failed: ' + error.message); else { toast('Outfit tidied away'); loadAll() }
  }

  /* ---- stylist ---- */
  const [chat, setChat] = useState<{ who: 'ai' | 'me'; text: string }[]>([
    { who: 'ai', text: "Hi Sayma 🌷 I know your whole closet. Ask me what to wear, what's neglected, or to build a look." },
  ])
  const [chatIn, setChatIn] = useState('')
  const reply = (q: string) => {
    q = q.toLowerCase()
    if (q.includes('wear today') || q.includes('what should i wear')) {
      const least = [...stats].sort((a, b) => a.wear_count - b.wear_count)[0]
      return least ? `Build today around your ${least.name.toLowerCase()} — only ${least.wear_count} wear${least.wear_count === 1 ? '' : 's'} so far. It deserves an outing 🤍` : 'Add some outfits and I will style you!'
    }
    if (q.includes('neglect') || q.includes('not worn') || q.includes('forgot')) {
      const neg = stats.filter((s) => !s.last_worn || new Date(s.last_worn).getTime() < Date.now() - 21 * 864e5)
      return neg.length ? `Waiting patiently: ${neg.map((n) => n.name).join(', ')}. Rotate one in this week 🍂` : 'Nothing neglected — beautifully rotated closet!'
    }
    if (q.includes('outfit') || q.includes('look') || q.includes('combo') || q.includes('generate')) return 'Open the Outfits tab and tap “Generate a new outfit with AI” — I pair by rotation and freshness.'
    if (q.includes('tip') || q.includes('advice') || q.includes('style')) return rand(CUTE_TIPS)
    if (q.includes('pack') || q.includes('trip') || q.includes('travel')) return 'Capsule rule: every top must pair with every bottom you pack. Keep the palette tight for 6+ looks.'
    if (q.includes('hi') || q.includes('hello') || q.includes('hey')) return 'Hello lovely 🌸 your closet is right in front of me — ask away.'
    return `I can see all ${wardrobe.length} pieces in your closet — ask me to style one, find neglected items, or plan a trip 💭`
  }
  const send = (q?: string) => {
    const v = (q ?? chatIn).trim(); if (!v) return
    setChat((c) => [...c, { who: 'me', text: v }]); setChatIn('')
    setTimeout(() => setChat((c) => [...c, { who: 'ai', text: reply(v) }]), 500)
  }

  /* ---- insights ---- */
  const most = [...stats].sort((a, b) => b.wear_count - a.wear_count)[0]
  const least = [...stats].sort((a, b) => a.wear_count - b.wear_count)[0]
  const totalWears = stats.reduce((a, s) => a + s.wear_count, 0)
  const catCount = new Set(wardrobe.map((w) => w.category)).size
  const hr = new Date().getHours()
  const greet = hr < 12 ? 'Good morning, Sayma' : hr < 17 ? 'Good afternoon, Sayma' : 'Good evening, Sayma'
  const negFirst = stats.find((s) => !s.last_worn || new Date(s.last_worn).getTime() < Date.now() - 21 * 864e5) || stats[0]

  const chipCls = (on: boolean) =>
    `rounded-full border px-4 py-1.5 text-[13px] transition-all cursor-pointer ${on ? 'bg-[var(--cocoa)] border-[var(--cocoa)] text-[var(--cream)]' : 'border-[var(--sand)] text-[var(--cocoa)] hover:bg-[var(--cocoa)] hover:text-[var(--cream)] hover:border-[var(--cocoa)]'}`
  const headCls = 'mt-12 mb-6 flex flex-wrap items-baseline justify-between gap-3'
  const h2Cls = 'font-display text-4xl font-medium'
  const capCls = 'text-[13px] uppercase tracking-[.2em] text-[var(--taupe)]'

  const card = (w: Cloth) => (
    <div key={w.id} className="card-shadow relative overflow-hidden rounded-3xl border border-[rgba(217,199,169,.35)] bg-[var(--paper)] transition-all hover:-translate-y-1.5">
      <button onClick={() => toggleFav(w.id, !w.is_favorite)} className="absolute right-3.5 top-3.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(255,253,249,.9)] transition-transform hover:scale-110">{w.is_favorite ? '🩷' : '🤍'}</button>
      <button onClick={() => archive(w.id, w.name)} title="Remove" className="absolute right-3.5 top-14 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(255,253,249,.9)] opacity-0 transition-all hover:scale-110 group-hover:opacity-100">🗑️</button>
      {w.image_url
        ? <div className="h-[210px] bg-[#EFE7D8] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${w.image_url})` }} />
        : <div className="flex h-[210px] items-center justify-center bg-[#EFE7D8] text-[54px]">{EMOJI[w.category] || '🧺'}</div>}
      <div className="px-5 py-4">
        <h4 className="font-display text-[19px] font-semibold leading-tight">{w.name}</h4>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12.5px] text-[var(--taupe)]">{statFor(w.id).wear_count} wears</span>
          {w.is_favorite && <span className="text-[11px] uppercase tracking-wider text-[var(--rose)]">loved</span>}
        </div>
      </div>
    </div>
  )

  return (
    <main className="relative min-h-screen">
      <Petals />
      {/* full-screen cute loader while the AI works */}
      {busy && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[rgba(247,241,232,.92)] backdrop-blur-sm px-8 text-center">
          <div className="mb-6 h-12 w-12 animate-spin rounded-full border-[3px] border-[var(--sand)] border-t-[var(--rose)]" />
          <div className="font-display text-[24px] font-semibold text-[var(--cocoa)]">{procMsg}</div>
          <div className="mt-3 max-w-[420px] text-[14px] italic leading-relaxed text-[var(--taupe)]">{tipMsg}</div>
          {phase === 'cutting' && <div className="mt-5 text-[12px] text-[var(--taupe)]">tailoring the perfect cut-out — just a moment 🌸</div>}
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-[1180px] px-7 pb-24">
        <nav className="flex flex-wrap items-center justify-between gap-3 pt-8 pb-3">
          <div className="font-display text-[26px] font-semibold">
            Sayma&apos;s <em className="italic text-[var(--rose)]">Cutedrobe</em>
            <span className="live-dot ml-3 align-middle text-[10px] uppercase tracking-[.2em] text-[#7BA05B]">live</span>
          </div>
          <div className="card-shadow flex flex-wrap gap-1.5 rounded-full bg-[rgba(255,253,249,.72)] p-1.5 backdrop-blur-md">
            {(['home', 'closet', 'outfits', 'stylist', 'journal', 'insights'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 text-[13px] uppercase tracking-wider transition-all ${tab === t ? 'bg-[var(--cocoa)] text-[var(--cream)]' : 'text-[var(--taupe)] hover:text-[var(--cocoa)]'}`}>{t}</button>
            ))}
          </div>
        </nav>

        {loadErr && (
          <div className="rise mt-4 rounded-2xl border border-[#d9a4a4] bg-[#fbeaea] px-5 py-4 text-[14px] text-[#8a4444]">
            Couldn&apos;t reach her closet: <b>{loadErr}</b><button onClick={loadAll} className="ml-3 underline">retry</button>
          </div>
        )}

        {tab === 'home' && (
          <section className="rise pt-16 text-center">
            <div className="mb-4 text-[12px] uppercase tracking-[.34em] text-[var(--taupe)]">a wardrobe that knows her</div>
            <h1 className="font-display text-[clamp(46px,7.5vw,84px)] font-medium leading-[1.02]">Dressed in <span className="italic text-[var(--rose)]">petals</span>,<br />styled by heart.</h1>
            <p className="mx-auto mt-6 max-w-[520px] text-[16.5px] leading-relaxed text-[var(--cocoa)]">Snap an outfit, and it&apos;s cut out and catalogued — real photos of every look she owns, sorted and re-styled.</p>
            <div className="card-shadow-lg mx-auto mt-10 flex max-w-[640px] items-center gap-5 rounded-3xl border border-[rgba(217,199,169,.4)] bg-[rgba(255,253,249,.8)] px-8 py-6 text-left backdrop-blur-md">
              <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full text-2xl" style={{ background: 'radial-gradient(circle at 32% 28%, var(--blush), var(--rose))' }}>🌸</div>
              <div>
                <h3 className="font-display text-[20px] font-semibold">{greet}</h3>
                <p className="text-[14.5px] leading-snug text-[var(--cocoa)]">{negFirst ? `Your ${negFirst.name.toLowerCase()} ${negFirst.last_worn ? `hasn't been out since ${negFirst.last_worn}` : 'is waiting for its first outing'} — shall we style it today?` : 'Upload her first outfit photo to begin 📸'}</p>
              </div>
            </div>
          </section>
        )}

        {tab === 'closet' && (
          <section className="rise">
            <h2 className="font-display mt-12 mb-6 text-4xl font-medium">Add an <em className="italic text-[var(--rose)]">outfit</em></h2>
            <div className="card-shadow grid grid-cols-1 gap-6 rounded-3xl border border-[rgba(217,199,169,.35)] bg-[var(--paper)] p-7 md:grid-cols-[280px_1fr]">
              <div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f) }} />
                <div onClick={() => !busy && fileRef.current?.click()}
                  className="flex aspect-[3/4] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-[1.5px] border-dashed border-[var(--sand)] bg-[#F3ECDF] text-center transition-colors hover:border-[var(--rose)]">
                  {preview ? <img src={preview} alt="outfit" className="h-full w-full object-cover" />
                    : <div className="px-4 text-[var(--taupe)]"><div className="mb-2 text-4xl">📸</div><div className="font-display text-[18px] font-semibold text-[var(--cocoa)]">Upload outfit photo</div><div className="text-[13px]">required · AI keeps just the outfit</div></div>}
                </div>
              </div>
              <div className="flex flex-col justify-center gap-4">
                <div>
                  <label className="mb-1.5 block text-[12px] uppercase tracking-[.14em] text-[var(--taupe)]">Outfit name</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Striped café blouse" disabled={busy}
                    className="w-full rounded-xl border border-[var(--sand)] bg-[var(--cream)] px-3.5 py-2.5 text-[14.5px] outline-none focus:border-[var(--rose)]" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] uppercase tracking-[.14em] text-[var(--taupe)]">Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} disabled={busy}
                    className="w-full rounded-xl border border-[var(--sand)] bg-[var(--cream)] px-3.5 py-2.5 text-[14.5px] outline-none focus:border-[var(--rose)]">
                    {CATS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={addItem} disabled={busy}
                  className="rounded-full bg-[var(--cocoa)] px-6 py-3.5 text-[14px] uppercase tracking-[.14em] text-[var(--cream)] transition-colors hover:bg-[var(--rose)] disabled:opacity-60">Add to closet</button>
              </div>
            </div>

            <div className={headCls}><h2 className={h2Cls}>Her <em className="italic text-[var(--rose)]">closet</em></h2><span className={capCls}>{wardrobe.length} outfits · {grouped.length} categories</span></div>
            <div className="mb-4 flex flex-wrap gap-2">
              {['All', ...CATS.filter((c) => wardrobe.some((w) => w.category === c))].map((c) => (
                <button key={c} className={chipCls(filter === c)} onClick={() => setFilter(c)}>{c === 'All' ? 'All' : `${EMOJI[c]} ${c}`}</button>
              ))}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search her closet…"
              className="mb-8 w-full rounded-full border border-[var(--sand)] bg-[var(--paper)] px-5 py-3 text-[14.5px] outline-none focus:border-[var(--rose)]" />

            {grouped.map((g) => (
              <div key={g.cat} className="mb-10">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-[22px]">{EMOJI[g.cat]}</span>
                  <h3 className="font-display text-[24px] font-semibold">{g.cat}</h3>
                  <span className="rounded-full bg-[var(--beige)] px-2.5 py-0.5 text-[11px] text-[var(--cocoa)]">{g.items.length}</span>
                  <div className="h-px flex-1 bg-[var(--sand)] opacity-50" />
                </div>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">{g.items.map(card)}</div>
              </div>
            ))}
            {!shown.length && <p className="text-[var(--taupe)]">Nothing here yet — upload her first outfit above 🌷</p>}
          </section>
        )}

        {tab === 'outfits' && (
          <section className="rise">
            <div className={headCls}><h2 className={h2Cls}>Her <em className="italic text-[var(--rose)]">outfits</em></h2><span className={capCls}>{outfits.length} looks</span></div>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button onClick={generateOutfit} disabled={generating}
                className="rounded-full bg-[var(--cocoa)] px-6 py-3 text-[14px] uppercase tracking-[.14em] text-[var(--cream)] transition-colors hover:bg-[var(--rose)] disabled:opacity-50">
                {generating ? 'Styling…' : '✨ Generate a look'}
              </button>
              <div className="ml-auto flex gap-2">
                {(['All', 'AI', 'Saved'] as const).map((f) => (
                  <button key={f} className={chipCls(ofFilter === f)} onClick={() => setOfFilter(f)}>{f === 'AI' ? 'AI picks' : f}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shownOutfits.map((o) => (
                <div key={o.id} className="card-shadow group overflow-hidden rounded-3xl border border-[rgba(217,199,169,.35)] bg-[var(--paper)] transition-all hover:-translate-y-1">
                  <div className="flex h-[190px] bg-[#EFE7D8]">
                    {o.outfit_items.map((oi, k) => (
                      oi.clothes?.image_url
                        ? <div key={k} className="flex-1 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${oi.clothes.image_url})` }} />
                        : <div key={k} className="flex flex-1 items-center justify-center text-4xl">{EMOJI[oi.clothes?.category || ''] || '👗'}</div>
                    ))}
                  </div>
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <h4 className="font-display text-[19px] font-semibold">{o.name || 'Outfit'}</h4>
                      {o.ai_generated && <span className="rounded-full bg-[var(--blush)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--cocoa)]">AI</span>}
                    </div>
                    <div className="mt-1 text-[13px] text-[var(--taupe)]">{o.outfit_items.map((i) => i.clothes?.name).filter(Boolean).join(' + ')}</div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => wearOutfit(o)} className="flex-1 rounded-full bg-[var(--cocoa)] py-2 text-[12px] uppercase tracking-wider text-[var(--cream)] transition-colors hover:bg-[var(--rose)]">Wear today</button>
                      <button onClick={() => deleteOutfit(o.id)} className="rounded-full border border-[var(--sand)] px-3 py-2 text-[13px] opacity-0 transition-all hover:border-[var(--rose)] group-hover:opacity-100">🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
              {!shownOutfits.length && (
                <div className="col-span-full rounded-3xl border border-dashed border-[var(--sand)] bg-[rgba(255,253,249,.5)] px-8 py-14 text-center">
                  <div className="mb-2 text-4xl">🪞</div>
                  <p className="font-display text-[20px] font-semibold text-[var(--cocoa)]">No looks here yet</p>
                  <p className="mt-1 text-[14px] text-[var(--taupe)]">Tap “Generate a look” and let her closet surprise her.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === 'stylist' && (
          <section className="rise">
            <div className={headCls}><h2 className={h2Cls}>Her <em className="italic text-[var(--rose)]">stylist</em></h2><span className={capCls}>reads her real closet</span></div>
            <div className="card-shadow-lg mx-auto max-w-[760px] overflow-hidden rounded-[28px] border border-[rgba(217,199,169,.35)] bg-[var(--paper)]">
              <div className="flex h-[420px] flex-col gap-4 overflow-y-auto p-7">
                {chat.map((m, i) => (
                  <div key={i} className={`rise max-w-[78%] rounded-[20px] text-[14.5px] leading-relaxed ${m.who === 'ai' ? 'self-start rounded-bl-md bg-[var(--beige)]' : 'self-end rounded-br-md bg-[var(--cocoa)] text-[var(--cream)]'}`} style={{ padding: '14px 18px' }}>{m.text}</div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 px-7 pb-3">
                {['What should I wear today?', 'What have I not worn lately?', 'Give me a style tip'].map((q) => (
                  <button key={q} className={chipCls(false)} onClick={() => send(q)}>{q}</button>
                ))}
              </div>
              <div className="flex gap-2.5 border-t border-[var(--beige)] px-5 py-4">
                <input value={chatIn} onChange={(e) => setChatIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask your stylist anything…"
                  className="flex-1 rounded-full bg-[var(--cream)] px-5 py-3 text-[14.5px] outline-none" />
                <button onClick={() => send()} className="h-[46px] w-[46px] rounded-full bg-[var(--rose)] text-[17px] text-white transition-transform hover:scale-105">➤</button>
              </div>
            </div>
          </section>
        )}

        {tab === 'journal' && (
          <section className="rise">
            <div className={headCls}><h2 className={h2Cls}>Wear <em className="italic text-[var(--rose)]">journal</em></h2><span className={capCls}>every outfit remembered</span></div>
            <div className="flex flex-col gap-4">
              {wearLog.map((w) => (
                <div key={w.id} className="card-shadow flex items-center gap-4 rounded-3xl border border-[rgba(217,199,169,.35)] bg-[var(--paper)] px-6 py-4">
                  <div className="text-3xl">{w.rating === 'great' ? '🙂' : w.rating === 'okay' ? '😐' : w.rating === 'disliked' ? '☹️' : '👗'}</div>
                  <div>
                    <div className="font-display text-[18px] font-semibold">{w.outfits?.name || 'Outfit'}</div>
                    <div className="text-[13px] text-[var(--taupe)]">{(w.outfits?.outfit_items || []).map((oi) => oi.clothes?.name).filter(Boolean).join(' + ') || '—'}</div>
                    <div className="mt-0.5 text-[12px] text-[var(--taupe)]">{w.worn_on}{w.occasion ? ` · ${w.occasion}` : ''}</div>
                  </div>
                </div>
              ))}
              {!wearLog.length && <p className="text-[var(--taupe)]">No outfits logged yet — wear one from the Outfits tab 🌷</p>}
            </div>
          </section>
        )}

        {tab === 'insights' && (
          <section className="rise">
            <div className={headCls}><h2 className={h2Cls}>Wardrobe <em className="italic text-[var(--rose)]">insights</em></h2><span className={capCls}>computed live</span></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { num: String(wardrobe.length), lbl: 'Outfits', sub: 'In her closet right now.' },
                { num: String(outfits.length), lbl: 'Looks', sub: 'Saved & AI-generated combinations.' },
                { num: String(totalWears), lbl: 'Total wears', sub: 'Times outfits have been logged.' },
                ...(most ? [{ num: EMOJI[most.category] || '👚', lbl: 'Most loved', sub: `${most.name} — ${most.wear_count} wear${most.wear_count === 1 ? '' : 's'}.` }] : []),
                ...(least ? [{ num: EMOJI[least.category] || '🧺', lbl: 'Needs love', sub: `${least.name} — ${least.wear_count} wear${least.wear_count === 1 ? '' : 's'}. Style it soon?` }] : []),
                { num: String(catCount), lbl: 'Categories', sub: 'Variety across her wardrobe.' },
              ].map((s, i) => (
                <div key={i} className="card-shadow rounded-3xl border border-[rgba(217,199,169,.35)] bg-[var(--paper)] p-6">
                  <div className="font-display text-[44px] font-semibold leading-none text-[var(--rose)]">{s.num}</div>
                  <div className="mt-2 text-[12px] uppercase tracking-[.16em] text-[var(--taupe)]">{s.lbl}</div>
                  <div className="mt-2 text-[13px] leading-snug text-[var(--cocoa)]">{s.sub}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className={`fixed bottom-6 left-1/2 z-[95] -translate-x-1/2 rounded-full bg-[var(--cocoa)] px-6 py-3 text-[14px] text-[var(--cream)] shadow-xl transition-transform duration-500 ${toastMsg ? 'translate-y-0' : 'translate-y-24'}`}>{toastMsg || '‎'}</div>
    </main>
  )
}
