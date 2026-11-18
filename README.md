# Council

Ask once, three models answer. An Expo mobile app (iOS and Android) in which three free frontier models answer every prompt in parallel. Each model works from a brief written by its peer. You can swipe between the answers, mark the strongest, and ask a "chair" model to reconcile them into one consensus.

**Stack:** Expo SDK 58 · Expo Router (screens + API routes) · React Native 0.88 · Reanimated 4 · Gesture Handler 3 · Zustand · Zod · Drizzle ORM + postgres.js (Supabase Postgres) · OpenRouter free models with a keyless Pollinations fallback · Geist / Geist Mono.

## Features

- **Phone-first chat layout.** The app uses a "shadcn dark" design system (see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)):
  - Your messages appear in muted bubbles. Answers appear unboxed, with copy, prefer and share actions underneath.
  - The composer card has a memory toggle and a send/stop button.
  - On a new chat, a centered greeting shows suggestion cards.
- **Drawer.** Open it with the menu button or an edge swipe. It has section tabs (Chats, Status, Insights), search, a new-chat button, chats grouped by Pinned / Today / Yesterday / Previous 7 days, and rename, pin and delete (long-press a chat).
- **Three answers per message.** Switch between the models using the chips above the answer, the ‹ 1/3 › pager, or a sideways swipe. Answers stream in live and show a pulsing "thinking" indicator.
- **Peer-ring briefs.** Each model answers from a brief written by the previous model in the ring (1 → 2 → 3 → 1). The "Brief from …" disclosure shows that brief.
- **Consensus.** "Build consensus" merges all answers into one inline message with these sections: Verdict, Where the council agrees, Where it differs, Final answer.
- **Failover.** If a model fails, the app moves to the next free model, then to the next OpenRouter key, then to the keyless tier. A reply that contains only reasoning and no answer counts as a failure.
- **Other features:**
  - Conversation memory.
  - Council status: the model behind each seat and today's remaining quota.
  - Insights.
  - Dark (default), Light, or System theme.
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
  theme/               design tokens (shadcn dark/light roles, Geist type scale, radii, springs) + provider
  components/shell.tsx screen frame + header
  components/ui        primitives: Button, TextField, Segmented, Toggle, Badge, ListGroup, Sheet, Skeleton, Toast…
  components/chat      composer, messages, directive inspector, drawer, thread actions
```
