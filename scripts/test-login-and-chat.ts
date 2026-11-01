/**
 * End-to-end verification: login-driven free model verification + real chat turn.
 *
 * 1. Logs a user in (HTTP login against the dev server when available, otherwise
 *    the same flow is executed directly) which triggers `verifyAndPersistFreeModels`.
 * 2. Queries PostgreSQL `verified_free_models` directly and asserts all 3 council
 *    seats are saved with isFree=true and isAvailable=true.
 * 3. Runs a real chat turn through `runMultiAgentPipeline`, measures latency, and
 *    asserts all 3 seats produced genuine AI answers (no "### Live Model Error").
 * 4. Confirms the turn is persisted in `multi_agent_turns` and `chat_threads`.
 *
 * Run: npx tsx --env-file=.env scripts/test-login-and-chat.ts
 */

import assert from 'node:assert';
import { eq } from 'drizzle-orm';

import { client, db } from '../src/db';
import {
  appAccounts,
  chatThreads,
  multiAgentTurns,
  verifiedFreeModels,
  type AgentResponseItem,
} from '../src/db/schema';
import { hashPassword } from '../src/lib/auth/password';
import { createSession } from '../src/lib/auth/session';
import {
  getConfiguredModelsFromDb,
  verifyFreeModelsOnLogin,
  type VerifiedModelConfig,
} from '../src/lib/ai/model-registry';
import { runMultiAgentPipeline } from '../src/lib/ai/orchestrator';
import { describeFreeQuotaExhaustion, isFreeQuotaExhausted } from '../src/lib/ai/model-rotation';
import { COUNCIL_AGENTS } from '../src/lib/ai/agents';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8081';
/** Total chat turn budget (3 council models in parallel, 20s per candidate). */
const MAX_TURN_MS = 45_000;

const COUNCIL_SEAT_IDS = COUNCIL_AGENTS.map((a) => a.id);

/** Thrown when an environmental limit (OpenRouter daily free quota) blocks a check. */
class SkipCheck extends Error {}

interface CheckResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
  durationMs: number;
  details?: string;
}

const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - t0;
    results.push({ name, passed: true, durationMs });
    console.log(`  ✅ [PASS] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    if (err instanceof SkipCheck) {
      results.push({ name, passed: false, skipped: true, durationMs, details: err.message });
      console.warn(`  ⏭️  [SKIP] ${name} (${durationMs}ms): ${err.message}`);
      return;
    }
    results.push({ name, passed: false, durationMs, details: err?.message || String(err) });
    console.error(`  ❌ [FAIL] ${name} (${durationMs}ms): ${err?.message || err}`);
  }
}

function isQuotaMessage(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return lower.includes('free-model daily quota') || lower.includes('free-models-per-day');
}

function isFreeModelId(modelId: string): boolean {
  return (
    modelId.endsWith(':free') ||
    modelId === 'openrouter/free' ||
    // Keyless Pollinations tier: no API key, no per-key daily cap, 100% free.
    modelId.startsWith('pollinations/')
  );
}

async function serverIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Login through the real HTTP endpoint when the dev server is running, so the
 * login-triggered verification path itself is exercised.
 */
async function httpLogin(email: string, password: string): Promise<VerifiedModelConfig[]> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Login failed (${res.status}): ${data?.error || JSON.stringify(data)}`);
  }
  if (!data.token) throw new Error('Login response did not include a session token');
  if (!Array.isArray(data.verifiedModels)) {
    throw new Error('Login response did not include verifiedModels');
  }
  console.log(
    `    login: modelsVerified=${data.modelsVerified} modelVerificationMs=${data.modelVerificationMs}`
  );
  return data.verifiedModels as VerifiedModelConfig[];
}

/** Direct fallback when the Expo dev server is not running. */
async function directLoginFlow(email: string, password: string): Promise<VerifiedModelConfig[]> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db
    .select({ id: appAccounts.id })
    .from(appAccounts)
    .where(eq(appAccounts.email, normalizedEmail))
    .limit(1);

  let accountId: number;
  if (existing.length > 0) {
    accountId = existing[0].id;
  } else {
    const [inserted] = await db
      .insert(appAccounts)
      .values({
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        fullName: 'Login & Chat Verification Runner',
        createdAt: new Date(),
      })
      .returning({ id: appAccounts.id });
    accountId = inserted.id;
  }

  // Same calls the login route makes: create a session + verify/persist models.
  await createSession(accountId);
  const startedAt = Date.now();
  const models = await verifyFreeModelsOnLogin(4500);
  console.log(`    direct login flow: verifyFreeModelsOnLogin took ${Date.now() - startedAt}ms`);
  return models;
}

async function main() {
  console.log('\n===============================================================');
  console.log('   LOGIN → FREE MODEL VERIFICATION → LIVE CHAT VERIFICATION     ');
  console.log('===============================================================\n');

  const stamp = Date.now();
  const email = `chat_verify_${stamp}@example.com`;
  const password = 'Password123!Secure';
  const fullName = 'Login & Chat Verification Runner';

  let loginModels: VerifiedModelConfig[] = [];
  let authToken = '';
  const serverUp = await serverIsUp();

  // ----------------------------------------------------------------
  // 1. Signup + Login (triggers free model verification)
  // ----------------------------------------------------------------
  console.log(`➡️ Suite 1: Login & free model verification (dev server ${serverUp ? 'UP' : 'DOWN — running flow directly'})`);

  await check('Login runs free model verification and returns verifiedModels', async () => {
    const t0 = Date.now();

    if (serverUp) {
      const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
        signal: AbortSignal.timeout(20_000),
      });
      const signupData: any = await signupRes.json();
      if (signupRes.status !== 201 || !signupData.success) {
        throw new Error(
          `Signup failed (${signupRes.status}): ${signupData?.error || JSON.stringify(signupData)}`
        );
      }
      if (!Array.isArray(signupData.verifiedModels) || signupData.verifiedModels.length !== 3) {
        throw new Error(
          `Signup did not verify 3 seats: ${JSON.stringify(signupData.verifiedModels)}`
        );
      }

      loginModels = await httpLogin(email, password);
    } else {
      loginModels = await directLoginFlow(email, password);
    }

    const loginMs = Date.now() - t0;
    console.log(`    login wall-clock: ${loginMs}ms`);
    assert.strictEqual(loginModels.length, 3, 'login must return exactly 3 verified seats');
    for (const seatId of COUNCIL_SEAT_IDS) {
      assert(
        loginModels.some((m) => m.seatId === seatId),
        `login verification missing seat ${seatId}`
      );
    }
  });

  // Obtain a token for authenticated chat calls (optional; we call the pipeline directly).
  if (serverUp) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20_000),
    });
    const data: any = await res.json();
    if (data?.token) authToken = data.token;
  }

  // ----------------------------------------------------------------
  // 2. PostgreSQL verified_free_models assertions
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 2: PostgreSQL `verified_free_models` persistence');

  let dbModels: (typeof verifiedFreeModels.$inferSelect)[] = [];

  await check('All 3 council seats are saved in PostgreSQL with isFree=true', async () => {
    dbModels = await db.select().from(verifiedFreeModels);
    assert.strictEqual(dbModels.length, 3, `expected 3 rows, found ${dbModels.length}`);

    for (const seatId of COUNCIL_SEAT_IDS) {
      const row = dbModels.find((r) => r.seatId === seatId);
      assert(row, `seat ${seatId} is missing from verified_free_models`);
      assert.strictEqual(row.isFree, true, `${seatId}.isFree must be true`);
      assert.strictEqual(row.isAvailable, true, `${seatId}.isAvailable must be true`);
      assert(isFreeModelId(row.primaryModel), `${seatId}.primaryModel is not a free model: ${row.primaryModel}`);
      assert(
        Array.isArray(row.fallbackModels) && row.fallbackModels.length > 0,
        `${seatId}.fallbackModels must be a non-empty array`
      );
      for (const fallback of row.fallbackModels) {
        assert(isFreeModelId(fallback), `${seatId} has a non-free fallback: ${fallback}`);
      }
      assert(row.agentName.length > 0, `${seatId}.agentName is empty`);
      assert(row.provider.length > 0, `${seatId}.provider is empty`);
    }

    console.log('    ┌─ verified_free_models (PostgreSQL) ─────────────────────────────');
    for (const row of dbModels.sort((a, b) => a.seatId.localeCompare(b.seatId))) {
      console.log(
        `    │ ${row.seatId.padEnd(20)} primary=${row.primaryModel.padEnd(46)} ` +
          `latency=${row.latencyMs ?? '-'}ms free=${row.isFree} available=${row.isAvailable}`
      );
      console.log(`    │ ${''.padEnd(20)} fallbacks=${row.fallbackModels.length}: ${row.fallbackModels.join(', ')}`);
    }
    console.log('    └─────────────────────────────────────────────────────────────────');
  });

  await check('getConfiguredModelsFromDb() returns the persisted seat configs', async () => {
    const configs = await getConfiguredModelsFromDb(true);
    assert.strictEqual(configs.length, 3, `expected 3 configs, found ${configs.length}`);
    for (const seatId of COUNCIL_SEAT_IDS) {
      assert(
        configs.some((c) => c.seatId === seatId),
        `cached config missing seat ${seatId}`
      );
    }
  });

  // ----------------------------------------------------------------
  // 3. Real chat turn through the orchestrator
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 3: Live multi-agent chat turn (3 council models)');

  const prompt = 'Explain optimistic vs pessimistic locking in 2 bullet points.';
  let turn: Awaited<ReturnType<typeof runMultiAgentPipeline>> | null = null;
  let quotaExhausted = false;

  await check(`Chat turn completes in < ${MAX_TURN_MS}ms with 3 genuine AI answers`, async () => {
    const t0 = Date.now();
    turn = await runMultiAgentPipeline(prompt, undefined, undefined);
    const elapsedMs = Date.now() - t0;

    // Account-wide free daily quota exhaustion is an environment condition, not
    // an application bug — report it clearly and skip the dependent checks.
    const allQuotaErrors =
      turn.agentResponses.length > 0 &&
      turn.agentResponses.every(
        (r) => r.answer.startsWith('### Live Model Error') && isQuotaMessage(r.answer)
      );
    if (allQuotaErrors && isFreeQuotaExhausted()) {
      quotaExhausted = true;
      await db.delete(chatThreads).where(eq(chatThreads.id, turn.threadId)).catch(() => {});
      turn = null;
      throw new SkipCheck(describeFreeQuotaExhaustion());
    }

    console.log(`    total turn latency: ${elapsedMs}ms (pipeline reported ${turn.elapsedMs}ms)`);
    for (const r of turn.agentResponses as AgentResponseItem[]) {
      console.log(
        `    • ${r.agentId.padEnd(20)} model=${r.model.padEnd(44)} latency=${r.latencyMs ?? '-'}ms ` +
          `chars=${r.answer.length}`
      );
    }

    assert(elapsedMs < MAX_TURN_MS, `chat turn took ${elapsedMs}ms, budget is ${MAX_TURN_MS}ms`);
    assert.strictEqual(turn.agentResponses.length, 3, 'expected 3 council responses');
    for (const response of turn.agentResponses) {
      assert(
        !response.answer.startsWith('### Live Model Error'),
        `${response.agentId} returned a live model error: ${response.answer.slice(0, 200)}`
      );
      assert(response.answer.length >= 40, `${response.agentId} answer is too short`);
      assert(isFreeModelId(response.model), `${response.agentId} used a non-free model: ${response.model}`);
      assert(
        COUNCIL_SEAT_IDS.includes(response.agentId),
        `${response.agentId} is not a council seat id (UI logo mapping relies on this)`
      );
    }
  });

  // ----------------------------------------------------------------
  // 4. Persistence of the turn
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 4: Turn persistence (multi_agent_turns + chat_threads)');

  await check('Turn is saved in `multi_agent_turns` with all 3 agent responses', async () => {
    if (quotaExhausted) throw new SkipCheck('blocked by OpenRouter free daily quota');
    assert(turn, 'no turn was produced');
    const [row] = await db
      .select()
      .from(multiAgentTurns)
      .where(eq(multiAgentTurns.id, turn.turnId))
      .limit(1);

    assert(row, `turn ${turn.turnId} not found in multi_agent_turns`);
    assert.strictEqual(row.threadId, turn.threadId, 'threadId mismatch');
    assert.strictEqual(row.userPrompt, prompt, 'userPrompt mismatch');
    assert(row.optimizedPrompt.length > 0, 'optimizedPrompt is empty');
    assert(Array.isArray(row.agentResponses) && row.agentResponses.length === 3, 'agentResponses must have 3 items');
    assert(row.consensusSolution.length > 0, 'consensusSolution is empty');
  });

  await check('Thread exists in `chat_threads`', async () => {
    if (quotaExhausted) throw new SkipCheck('blocked by OpenRouter free daily quota');
    assert(turn, 'no turn was produced');
    const [thread] = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.id, turn.threadId))
      .limit(1);
    assert(thread, `thread ${turn.threadId} not found in chat_threads`);
    assert(thread.title.length > 0, 'thread title is empty');
  });

  if (serverUp && authToken) {
    await check('GET /api/threads/:threadId/messages returns the new turn', async () => {
      if (quotaExhausted) throw new SkipCheck('blocked by OpenRouter free daily quota');
      assert(turn, 'no turn was produced');
      const res = await fetch(`${BASE_URL}/api/threads/${turn.threadId}/messages`, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      assert(res.ok, `messages endpoint returned ${res.status}`);
      const turns: any[] = await res.json();
      assert(Array.isArray(turns), 'messages endpoint did not return an array');
      assert(
        turns.some((t) => t.turnId === turn!.turnId),
        `turn ${turn.turnId} not found via messages endpoint`
      );
    });
  }

  await check('GET /api/models/verify returns the persisted verified models', async () => {
    if (!serverUp) {
      const models = await verifyFreeModelsOnLogin(4500);
      assert.strictEqual(models.length, 3, 'expected 3 models from verification');
      return;
    }
    const res = await fetch(`${BASE_URL}/api/models/verify`, { signal: AbortSignal.timeout(20_000) });
    const data: any = await res.json();
    assert(res.ok && data.success, `verify endpoint failed: ${JSON.stringify(data).slice(0, 200)}`);
    assert(Array.isArray(data.models) && data.models.length === 3, 'verify endpoint must return 3 models');
  });

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('                    VERIFICATION SUMMARY                       ');
  console.log('===============================================================');
  const passed = results.filter((r) => r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.passed && !r.skipped).length;
  console.log(
    `Checks run: ${results.length}   Passed: ${passed}   Skipped: ${skipped}   Failed: ${failed}`
  );

  if (skipped > 0) {
    console.warn('\nSkipped checks (environmental limit, not a code failure):');
    for (const r of results.filter((x) => x.skipped)) {
      console.warn(`- ${r.name}: ${r.details}`);
    }
  }

  if (failed > 0) {
    console.error('\nFailed checks:');
    for (const r of results.filter((x) => !x.passed && !x.skipped)) {
      console.error(`- ${r.name}: ${r.details}`);
    }
    await client.end();
    process.exit(1);
  }

  console.log(
    skipped > 0
      ? '\n✅ LOGIN + MODEL VERIFICATION PASSED (live chat checks skipped: free quota exhausted)\n'
      : '\n🎉 LOGIN VERIFICATION + LIVE CHAT END-TO-END PASSED\n'
  );
  await client.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal verification error:', err);
  try {
    await client.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
