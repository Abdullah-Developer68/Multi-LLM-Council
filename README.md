# Multi LLM Council

A universal full-stack application built with **Expo (React Native)**, **Drizzle ORM**, **Supabase PostgreSQL**, **Zustand**, and **Vercel AI SDK**.

The system connects three specialized, active free AI models into a collaborative peer-to-peer ring deliberation council:
1. **Nemotron 3.5 Lightning** (`nvidia/nemotron-3.5-lightning:free`)
2. **Cohere North Mini** (`cohere/north-mini-code:free`)
3. **Nemotron Ultra (550B)** (`nvidia/nemotron-3-ultra-550b-a55b:free`)

---

## 🏛️ Core Architecture & Features

### 1. Peer-to-Peer Ring Prompt Optimization
- **Ring Transformation**: Each AI model optimizes the raw user prompt from its unique stance.
  - Model 0 optimizes the prompt for Model 1.
  - Model 1 optimizes the prompt for Model 2.
  - Model 2 optimizes the prompt for Model 0.
- **Cross-Model Execution**: Each model answers using the prompt engineered specifically for it by its peer.
- **Consensus Synthesis**: Synthesizes the council's collective solution with rationales and reasoning steps.
- **Resilient Fallback**: Auto-mitigates rate limits (HTTP 429) to ensure zero downtime.

### 2. Physical Stacked Cards Deck (Gesture Swipe)
- **Deck of Cards**: AI replies are displayed in a stacked card deck where cards 2 and 3 visibly peek from underneath (offset by 10px/20px and scaled down), clearly signaling cards are stacked behind.
- **Swipe Interactions**: Horizontal swipe gesture using `PanResponder` to discard/promote cards, with spring-back and jump indicators.
- **Original Model Logos**: Authentic vector SVG brand logos sourced from the `dashboardicons.com` MCP server for NVIDIA and Cohere.
- **Unified Dark Theme**: Consistent Slate/Zinc theme with high-contrast readability and clean neutral cards.

### 3. Structured Prompt Inspector
- Instead of raw monospace or simple markdown, an interactive accordion decomposes the engineered directive into:
  - **Optimizer Identity Badge**
  - **Cognitive Persona & Assigned Stance**
  - **Execution Objective**
  - **Target User Task**
  - **Reasoning Protocol Steps**
  - **Guardrails & Negative Constraints**
  - **Mode Toggle**: Structured view vs. raw directive with 1-tap copy.

### 4. Full-Stack Backend (Expo Router API Routes)
- Built directly inside Expo Router:
  - `POST /api/auth/signup`: Password hashing via `scrypt` with random salts.
  - `POST /api/auth/login`: Constant-time hash verification and 30-day session issuance.
  - `POST /api/auth/logout`: Revokes active sessions in Supabase.
  - `GET /api/auth/me`: Session validation endpoint.
  - `POST /api/multi-agent`: Peer prompt ring execution and turn persistence.
  - `GET / POST /api/threads`: Discussion session management.
  - `GET /api/threads/[threadId]/messages`: Thread deliberation history.
  - `GET / POST /api/users`: Drizzle ORM operations on the `users` table.

### 5. Zustand State Management (Slices Pattern)
- Single store with zero prop drilling:
  - `AuthSlice`: Session state, login, signup, logout.
  - `ChatSlice`: Turns, thread switching, multi-stage thinking messaging, active card views.
  - `UISlice`: History drawer slide-out.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your Supabase connection string and OpenRouter API key:
```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
OPENROUTER_API_KEY="sk-or-v1-..."
```

### 3. Push Database Schema to Supabase
```bash
npx drizzle-kit push
```

### 4. Start the Application
```bash
npx expo start
```
- Scan the QR code with **Expo Go** on your Android or iOS device.
- Or press `w` to run in the web browser.

---

## 🛠️ Tech Stack
- **Framework**: Expo SDK 58 (Expo Router v4)
- **Frontend**: React Native, React Native Reanimated, React Native Gesture Handler, Lucide Icons, React Native SVG
- **Database / ORM**: Supabase PostgreSQL, Drizzle ORM, postgres.js
- **State Management**: Zustand (single store with slices)
- **Validation**: Zod
- **AI Integration**: Vercel AI SDK (`ai`, `@ai-sdk/openai`), OpenRouter API
