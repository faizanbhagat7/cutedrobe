# Sayma's Cutedrobe

A refined Next.js 16 + Three.js wardrobe app, wired to a live Supabase database.
No pricing — it is a wardrobe, not a shop.

## Features
- Closet: upload an outfit PHOTO (required) -> AI cuts out just the outfit -> saved with name + category
- Outfits: all saved looks + an AI outfit generator (rotation + freshness logic) saved to the DB
- Stylist: chat that answers from her real closet
- Journal: every worn outfit with date + rating
- Insights: pieces, outfits, wears, most/least worn, variety — no money anywhere

## Run locally
Open a terminal in this folder and run these two commands, one per line:

npm install
npm run dev

Then open http://localhost:3000
(Do NOT paste any text after the command on the same line.)

## Environment
.env.local already holds the Supabase URL + publishable key for project "cutedrobe".

## Deploy to Vercel
1. Push this folder to a GitHub repo
2. vercel.com -> New Project -> import the repo
3. Add the two variables from .env.local under Environment Variables
4. Deploy

## The outfit cutout
Outfit photos are cut out by the Photoroom API (fashion-tuned, clean edges),
called from a server route so the key never reaches the browser. If Photoroom
is unreachable or out of free credits, it automatically falls back to a free
in-browser cutter, so adding outfits never breaks.

### Environment note
`.env.local` also holds PHOTOROOM_API_KEY (server-only, no NEXT_PUBLIC prefix).
When deploying to Vercel, add PHOTOROOM_API_KEY there too, alongside the two
Supabase variables.

## (legacy) in-browser cutout
When you add an outfit, the app runs an in-browser AI model that removes the
background and keeps only the outfit, then stores that clean photo. The first
cutout downloads the model once (a few seconds); after that it is fast.
