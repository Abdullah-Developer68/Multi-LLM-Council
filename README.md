# Council

Ask once, three models answer. A universal Expo app (iOS, Android, web) in which three free frontier models answer every prompt in parallel. Each model works from a brief written by its peer. You can swipe between the answers, mark the strongest, and ask a "chair" model to reconcile them into one consensus.

**Stack:** Expo SDK 58 · Expo Router (screens + API routes) · React Native 0.88 · Reanimated 4 · Gesture Handler 3 · Zustand · Zod · Drizzle ORM + postgres.js (Supabase Postgres) · OpenRouter free models with a keyless Pollinations fallback · Geist / Geist Mono.

## Features

- **Peer-ring briefs.** Seat 1 writes the brief for seat 2, seat 2 for seat 3, and seat 3 for seat 1. Briefs are built deterministically, so no quota is spent before the answers start.
- **Live token streaming.** `POST /api/council` streams NDJSON events. All three seats type into their cards at once, and the screen shows thinking, writing, and failover states.
- **Failover on three axes:** to the next free model, then to the next OpenRouter key, then to the keyless tier. A reasoning-only reply (scratch work with no answer) counts as a failure and triggers failover.
- **Swipeable card deck.** Cards are physically stacked. The top card follows your finger and tilts. Seat tabs show live status, and a sliding underline marks the selected seat.
- **Consensus.** One tap asks the chair to produce: Verdict, Where the council agrees, Where it differs, Final answer.
- **Preferences.** Mark the best answer on each turn. These votes feed the seat leaderboard.
- **Conversation memory.** Follow-ups send a summary of the last 3 turns. You can switch this per message or in Settings.
- **History drawer.** Opens with an edge swipe or the menu button. It groups threads by Pinned / Today / This week / Earlier, searches titles and prompts on the server, and supports rename, pin, and delete.
- **Council status.** Shows the verified model per seat, its fallback pool, cooling-down models, and the remaining free quota across keys. It can re-verify the catalog (free) or measure latency (uses up to 3 requests).
- **Insights.** Totals, 14-day activity, and a per-seat leaderboard (preferences, answer rate, average latency, failover rate, keyless rate).
- **Light and dark mode.** System, Light, or Dark, saved on the device.
- **Accounts.** Sessions persist for 30 days. You can rename yourself or sign out of all devices. Threads are scoped to their owner.
- Copy and share answers, copy code blocks, haptics on native, and Enter to send on web.

## Setup

```bash
npm install
cp .env.example .env   # fill in the values below
npx expo start         # press w for web, or scan the QR code with a dev build / Expo Go
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase transaction pooler works; `localhost` disables TLS). |
| `OPENROUTER_API_KEY` | Primary OpenRouter key. |
| `OPENROUTER_FALLBACK_KEYS` / `OPENROUTER_API_KEYS` | Optional extra keys (comma separated), used once a key hits its 50/day free cap. |
| `EXPO_PUBLIC_API_URL` | Optional. Points a native build at a deployed API instead of the dev server. |

The schema bootstraps itself. On first request, the server creates any missing tables and adds the v2 columns (`chat_threads.account_id`, `chat_threads.pinned`, `multi_agent_turns.meta`). It only adds tables and columns and never drops or rewrites data. `npx drizzle-kit push` also works against `src/server/db/schema.ts`.

## Scripts

```bash
npm run typecheck       # tsc --noEmit
npm run lint            # expo lint
npm test                # smoke-tests a running dev server (no model quota used)
npm run test:council    # + one live council turn and a consensus (~4 free requests)
```

## Layout

```
src/
  app/                 screens (index, sign-in, settings, council, insights) + api/ routes
  server/              server-only code: db, auth, ai (registry, rotation, providers, council, synthesis)
  shared/              types + seat definitions used by both client and server
  store/               Zustand store (session, prefs, threads, chat streaming, ui)
  theme/               design tokens (light/dark palettes, Geist type scale, springs) + provider
  components/ui        primitives: Button, TextField, Segmented, Toggle, Sheet, Skeleton, Toast…
  components/chat      composer, swipe deck, seat card, directive inspector, drawer, turns
```
