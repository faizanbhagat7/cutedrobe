/* Dynamic advice engine.
   Instead of cycling a fixed list, lines are *composed* at call time from
   context (hour, season, weekday, wardrobe state) using weighted selection
   with a no-repeat memory, so the same line rarely appears twice.

   Rough combination space: thousands of distinct sentences.
*/

export type Ctx = {
  hour: number
  month: number          // 0-11
  weekday: number        // 0 Sun … 6 Sat
  total: number          // pieces in closet
  unworn: number         // never-worn pieces
  neglected: string[]    // names not worn in 3+ weeks
  favourite?: string     // a favourited piece name
  topCategory?: string   // most common category
  missing: string[]      // categories she owns none of
  lastAdded?: string     // most recently added piece
}

/* ---------- fragments ---------- */

const SEASON = (m: number) => (m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn')

const OPENERS: Record<string, string[]> = {
  morning: ['This morning', 'To begin the day', 'Before the day starts', 'For the hours ahead'],
  afternoon: ['This afternoon', 'For the rest of today', 'Midday calls for', 'From here on'],
  evening: ['This evening', 'For tonight', 'As the light goes', 'For the evening ahead'],
}

const MAXIMS = [
  'Elegance is refusal — leave one thing off before you leave.',
  'Fit outranks label. Always.',
  'Neutrals never argue; let one piece do the talking.',
  'A collar pressed is worth three accessories.',
  'The quietest outfit in the room is usually the best dressed.',
  'Buy less, choose well, wear it often.',
  'Proportion is the whole secret — balance volume with a clean line.',
  'If it needs explaining, it needs changing.',
  'A well-kept hem flatters more than any embellishment.',
  'Repetition is not a failure of imagination; it is a signature.',
  'Dress for the room you are walking into, not the one you left.',
  'The best accessory is standing up straight.',
  'Simplicity is the ultimate sophistication.',
  'One considered piece outshines five borrowed trends.',
  'Tailoring is the difference between wearing clothes and being dressed.',
  'Let the fabric fall the way it wants to.',
  'Restraint reads as confidence.',
  'Shoes and hem should agree with each other.',
  'A good silhouette survives every passing trend.',
  'Detail rewards the second glance, never the first.',
  'Wear the colour that makes your face look rested.',
  'Nothing elevates a look like something that fits the shoulder.',
  'Choose the piece you would still like in five years.',
  'Contrast in texture, harmony in colour.',
  'An outfit finished in haste always shows it.',
  'The eye should have one place to rest.',
]

const SEASONAL: Record<string, string[]> = {
  winter: ['Layer thin over thin — warmth without bulk.', 'Deep tones carry winter light beautifully.', 'Let the outer layer be the statement.'],
  spring: ['Lighten the palette before you lighten the fabric.', 'One fresh tone against neutrals is enough.', 'Transitional weather rewards a good third piece.'],
  summer: ['Loose beats tight when the air is warm.', 'Natural fibres, uncomplicated shapes.', 'Let the cut breathe; keep the palette pale.'],
  autumn: ['Texture does the work the colour used to.', 'Warm neutrals belong to this season.', 'A considered layer changes everything.'],
}

const HOURLY: Record<string, string[]> = {
  early: ['Dress before the day dresses you.', 'Choose now; decide once.'],
  midday: ['If it has not worked by noon, change one element.', 'A midday refresh is usually one layer away.'],
  night: ['Evening asks for one deliberate touch, not three.', 'Lower light flatters deeper tones.'],
}

const RHYTHM: Record<string, string[]> = {
  weekday: ['Structure reads as confidence on a working day.', 'Keep it composed; save the drama for later in the week.'],
  friday: ['Ease into the weekend — soften one element.', 'A little less structure is earned by Friday.'],
  weekend: ['Comfort, cut well, still counts as dressed.', 'Weekends are for the pieces you actually reach for.'],
}

const NUDGES = {
  unworn: (n: string) => [
    `${n} is still waiting for its first outing.`,
    `${n} has yet to be worn — today could be the day.`,
    `Consider ${n}; it has never left the closet.`,
  ],
  neglected: (n: string) => [
    `${n} has been quiet for a while — bring it forward.`,
    `It has been some time since ${n} was worn.`,
    `${n} deserves another turn.`,
  ],
  favourite: (n: string) => [
    `${n} is a favourite for good reason — build around it.`,
    `Start from ${n} and let the rest stay quiet.`,
  ],
  missing: (c: string) => [
    `The closet has no ${c.toLowerCase()} yet — one good piece would open up new looks.`,
    `A single ${c.toLowerCase()} would widen the range considerably.`,
  ],
  sparse: [
    'A small, deliberate closet beats a crowded one.',
    'Every piece added should earn its place.',
  ],
  rich: (n: number) => [
    `With ${n} pieces, the combinations are far from exhausted.`,
    `${n} pieces means plenty of looks still untried.`,
  ],
}

/* ---------- weighted, non-repeating selection ---------- */

const recent: string[] = []
const MEMORY = 14

function fresh(pool: string[]): string {
  const unseen = pool.filter((p) => !recent.includes(p))
  const from = unseen.length ? unseen : pool
  const pick = from[Math.floor(Math.random() * from.length)]
  recent.push(pick)
  if (recent.length > MEMORY) recent.shift()
  return pick
}

/** Weighted pick over labelled buckets. */
function weighted<T extends string>(entries: [T, number][]): T {
  const total = entries.reduce((a, [, w]) => a + w, 0)
  let r = Math.random() * total
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k }
  return entries[entries.length - 1][0]
}

/* ---------- public API ---------- */

/** A short line of advice, composed fresh from her wardrobe + the moment. */
export function advice(ctx: Ctx): string {
  const season = SEASON(ctx.month)
  const rhythm = ctx.weekday === 5 ? 'friday' : ctx.weekday === 0 || ctx.weekday === 6 ? 'weekend' : 'weekday'

  // weight the *kind* of line by what's actually true of her closet
  const kind = weighted<'nudge' | 'maxim' | 'seasonal' | 'rhythm' | 'hourly'>([
    ['nudge', ctx.unworn || ctx.neglected.length || ctx.missing.length ? 3 : 0.4],
    ['maxim', 2],
    ['seasonal', 1.6],
    ['rhythm', 1.2],
    ['hourly', 1.1],
  ])

  if (kind === 'nudge') {
    const options: string[] = []
    if (ctx.unworn && ctx.lastAdded) options.push(...NUDGES.unworn(ctx.lastAdded))
    ctx.neglected.slice(0, 3).forEach((n) => options.push(...NUDGES.neglected(n)))
    if (ctx.favourite) options.push(...NUDGES.favourite(ctx.favourite))
    ctx.missing.slice(0, 2).forEach((c) => options.push(...NUDGES.missing(c)))
    if (ctx.total && ctx.total < 6) options.push(...NUDGES.sparse)
    if (ctx.total >= 10) options.push(...NUDGES.rich(ctx.total))
    if (options.length) return fresh(options)
  }
  if (kind === 'seasonal') return fresh(SEASONAL[season])
  if (kind === 'rhythm') return fresh(RHYTHM[rhythm])
  if (kind === 'hourly') {
    const slot = ctx.hour < 11 ? 'early' : ctx.hour < 18 ? 'midday' : 'night'
    return fresh(HOURLY[slot])
  }
  return fresh(MAXIMS)
}

/** A longer, composed styling suggestion — opener + substance. */
export function suggestion(ctx: Ctx): string {
  const part = ctx.hour < 12 ? 'morning' : ctx.hour < 17 ? 'afternoon' : 'evening'
  const opener = fresh(OPENERS[part])
  const body = advice(ctx)
  // sometimes lead with the opener, sometimes let the line stand alone
  return Math.random() < 0.55 ? `${opener}: ${body.charAt(0).toLowerCase()}${body.slice(1)}` : body
}

/** Build context from live wardrobe data. */
export function buildCtx(args: {
  items: { name: string; category: string; is_favorite: boolean }[]
  stats: { name: string; wear_count: number; last_worn: string | null }[]
  allCategories: string[]
}): Ctx {
  const now = new Date()
  const owned = new Set(args.items.map((i) => i.category))
  const neglected = args.stats
    .filter((s) => s.last_worn && new Date(s.last_worn).getTime() < Date.now() - 21 * 864e5)
    .map((s) => s.name)
  const counts: Record<string, number> = {}
  args.items.forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1 })
  return {
    hour: now.getHours(),
    month: now.getMonth(),
    weekday: now.getDay(),
    total: args.items.length,
    unworn: args.stats.filter((s) => s.wear_count === 0).length,
    neglected,
    favourite: args.items.find((i) => i.is_favorite)?.name,
    topCategory: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0],
    missing: args.allCategories.filter((c) => !owned.has(c)),
    lastAdded: args.items[0]?.name,
  }
}
