# Council

Ask once, three models answer. An Expo mobile app (iOS and Android) in which a prompt-refiner model first rewrites your prompt, then three free frontier models answer the refined prompt in parallel. You can swipe between the answers, mark the strongest, and ask a "chair" model to reconcile them into one consensus.

**Stack:** Expo SDK 58 · Expo Router (screens + API routes) · React Native 0.88 · Reanimated 4 · Gesture Handler 3 · Zustand · Zod · Drizzle ORM + postgres.js (Supabase Postgres) · OpenRouter free models with a keyless Pollinations fallback · Geist / Geist Mono.

## Features

- **Phone-first chat layout.** The app uses a "shadcn dark" design system (see [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)):
  - Your messages appear in muted bubbles. Answers appear unboxed, with copy, prefer and share actions underneath.
  - The composer card has a memory toggle and a send/stop button.
  - On a new chat, a centered greeting shows suggestion cards.
- **Drawer.** Open it with the menu button or an edge swipe. It has search, a new-chat button, chats grouped by Pinned / Today / Yesterday / Previous 7 days, and rename, pin and delete (long-press a chat).
- **Attachments.** Tap **+** in the composer to take a photo, pick from your library, or attach files. You can attach up to 5 per message, 15 MB each.
  - **Files:** PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), OpenDocument, and text, CSV, JSON or code files are read on the server.
  - **Photos:** these are shrunk on the phone, then a free vision model transcribes their text and describes them.
  - **How the models use them:** the three seats get the file contents alongside the refined prompt and ground their answers in them.
  - **Not supported:** old binary .doc/.ppt/.xls files and scanned PDFs are rejected with a hint.
- **Model picker.** The model button in the composer opens a sheet with search, filter chips for each company, real company logos, and a cost hint for each model. You can pick 1–4 models.
  - **One model** gives a single normal reply. **Several** answer side by side, and you can build a consensus from their answers.
  - **Selectable models:** every free model on OpenRouter whose output is text. Right now that's NVIDIA, Google Gemma, Cohere, Baidu, inclusionAI, Thinking Machines, Liquid, Recursive, Particle and Dots Studio, plus OpenAI's GPT-OSS 20B on the keyless tier. The keyless tier allows one reply every 45 seconds per server.
  - **Locked models:** the newest flagship models from OpenAI, Anthropic, Gemini, Meta, Mistral, DeepSeek, Qwen, xAI, Moonshot, Z.ai, MiniMax, Amazon, Perplexity and Microsoft are listed but marked **Pro**. Tapping one opens the pricing page.
  - **No silent swaps:** a model you picked answers as itself. If it's rate-limited, the app tells you instead of answering with a different model.
  - **Under the hood:** the catalog comes live from OpenRouter (`GET /api/catalog`), and your selection is saved on the device.
- **Three answers per message.** Switch between the models using the chips above the answer, the ‹ 1/3 › pager, or a sideways swipe. Answers stream in live and show a pulsing "thinking" indicator.
- **Prompt refiner (4th model).** Before the council answers, a refiner model rewrites your prompt with standard prompt-engineering techniques: it clarifies the goal, makes requirements explicit, chains multi-part tasks into steps, adds few-shot format examples when useful, and sets the output format. Its instructions live in a skill file, `src/server/ai/skills/prompt-refiner/SKILL.md`. All three seats receive the same refined prompt, and the "Prompt refined" disclosure shows it. If the refiner fails or takes longer than 25 seconds, your original prompt is sent instead. Each turn costs 4 free requests.
- **Consensus.** "Build consensus" merges all answers into one inline message with these sections: Verdict, Where the council agrees, Where it differs, Final answer.
- **Failover.** If a model fails, the app moves to the next free model, then to the next OpenRouter key, then to the keyless tier. A reply that contains only reasoning and no answer counts as a failure.
- **Other features:**
  - Conversation memory.
  - Council status: the model behind each seat and today's remaining quota.
  - Insights, shown in Settings.
  - A Plans & pricing screen, opened from "Upgrade" in the drawer or Settings. It is visual only: nothing is charged and no plan changes.
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
  app/                 screens (index, sign-in, settings, council, pricing) + api/ routes
  server/              server-only code: db, auth, ai (registry, rotation, providers, council, synthesis)
  shared/              types + seat definitions used by both client and server
  store/               Zustand store (session, prefs, threads, chat streaming, ui)
  theme/               design tokens (shadcn dark/light roles, Geist type scale, radii, springs) + provider
  components/shell.tsx screen frame + header
  components/ui        primitives: Button, TextField, Segmented, Toggle, Badge, ListGroup, Sheet, Skeleton, Toast…
  components/chat      composer, messages, refined-prompt disclosure, drawer, thread actions
  components/insights-panel.tsx  insights shown inside Settings
```
