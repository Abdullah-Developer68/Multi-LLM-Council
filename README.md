# Council

Ask once, three models answer. A universal Expo app (iOS, Android, web) in which three free frontier models answer every prompt in parallel. Each model works from a brief written by its peer. You can swipe between the answers, mark the strongest, and ask a "chair" model to reconcile them into one consensus.

**Stack:** Expo SDK 58 · Expo Router (screens + API routes) · React Native 0.88 · Reanimated 4 · Gesture Handler 3 · Zustand · Zod · Drizzle ORM + postgres.js (Supabase Postgres) · OpenRouter free models with a keyless Pollinations fallback · Geist / Geist Mono.

## Features

- **Familiar chat layout.** The page works like ChatGPT:
  - Your messages appear in grey bubbles and answers appear unboxed, with copy, prefer, and share actions underneath.
  - The rounded composer has an "Ask anything" prompt and a stop button.
  - On a new chat, a centered greeting shows suggestion chips.
- **Sidebar.** It stays docked on wide screens and can be collapsed. On phones it slides out as a drawer, and you can open it with an edge swipe. It has New chat, Search chats, chats grouped by Today / Yesterday / Previous 7 days, and rename, pin, and delete.
- **Three answers per message.** Switch between the models using the chips above the answer, the ‹ 1/3 › pager, or a sideways swipe. Answers stream in live and show a pulsing "thinking" indicator.
- **Peer-ring briefs.** Each model answers from a brief written by the previous model in the ring (1 → 2 → 3 → 1). The "Brief from …" disclosure shows that brief.
- **Consensus.** "Build consensus" merges all answers into one inline message with these sections: Verdict, Where the council agrees, Where it differs, Final answer.
- **Failover.** If a model fails, the app moves to the next free model, then to the next OpenRouter key, then to the keyless tier. A reply that contains only reasoning and no answer counts as a failure.
- **Other features:**
  - Conversation memory.
  - Council status: the model behind each seat and today's remaining quota.
  - Insights.
  - Light, Dark, or System theme.
  - Sessions that persist for 30 days.
  - Chats that are private to each account.

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
