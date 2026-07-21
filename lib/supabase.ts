import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type Cloth = {
  id: string; name: string; category: string; color: string | null
  season: string; style: string | null; image_url: string | null; is_favorite: boolean
}
export type ItemStat = {
  id: string; name: string; category: string
  wear_count: number; last_worn: string | null
}
export type WearEntry = {
  id: string; worn_on: string; occasion: string | null; rating: 'great' | 'okay' | 'disliked' | null
  outfits: { name: string | null; outfit_items: { clothes: { name: string } | null }[] } | null
}
export type Outfit = {
  id: string; name: string | null; occasion: string | null; ai_generated: boolean
  outfit_items: { slot: string | null; clothes: { name: string; category: string; image_url: string | null } | null }[]
}
