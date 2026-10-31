import { db } from '../src/db';
import { chatThreads, multiAgentTurns, appAccounts, appSessions } from '../src/db/schema';
import { eq } from 'drizzle-orm';

const BASE_URL = 'http://localhost:8081';

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: TestResult[] = [];

async function runTest(suite: string, name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - t0;
    results.push({ suite, test: name, passed: true, durationMs });
    console.log(`  ✅ [PASS] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    results.push({ suite, test: name, passed: false, durationMs, details: err?.message || String(err) });
    console.error(`  ❌ [FAIL] ${name} (${durationMs}ms): ${err?.message || err}`);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('   EXTENSIVE FULL-STACK MULTI-AGENT APP TEST SUITE    ');
  console.log('======================================================\n');

  const testEmail = `test_runner_${Date.now()}@example.com`;
  const testPassword = 'Password123!Secure';
  const testName = 'Test Automated Runner';
  let authToken = '';
  let testThreadId = '';
  let testTurnId = '';

  // ----------------------------------------------------------------
  // 1. System & Health
  // ----------------------------------------------------------------
  console.log('➡️ Suite 1: Health & Database Connectivity');
  await runTest('Health', 'GET /api/health returns 200 and healthy status', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Expected status ok, got ${data.status}`);
  });

  await runTest('Health', 'Direct Supabase database query succeeds', async () => {
    const accounts = await db.select({ count: appAccounts.id }).from(appAccounts).limit(1);
    if (!Array.isArray(accounts)) throw new Error('DB select returned invalid data');
  });

  // ----------------------------------------------------------------
  // 2. Authentication Flow
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 2: Authentication & Sessions');
  await runTest('Auth', 'POST /api/auth/signup creates account & returns session token', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, fullName: testName }),
    });
    if (res.status !== 201) {
      const err = await res.text();
      throw new Error(`Status ${res.status}: ${err}`);
    }
    const data = await res.json();
    if (!data.success || !data.token || data.user.email !== testEmail.toLowerCase()) {
      throw new Error(`Invalid signup response: ${JSON.stringify(data)}`);
    }
    authToken = data.token;
  });

  await runTest('Auth', 'POST /api/auth/signup rejects duplicate email with 409 Conflict', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, fullName: 'Duplicate' }),
    });
    if (res.status !== 409) {
      throw new Error(`Expected 409 Conflict, got ${res.status}`);
    }
  });

  await runTest('Auth', 'GET /api/auth/me returns current user info for valid token', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || data.user.email !== testEmail.toLowerCase()) {
      throw new Error(`Mismatch in user info: ${JSON.stringify(data)}`);
    }
  });

  await runTest('Auth', 'GET /api/auth/me rejects unauthorized request with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await runTest('Auth', 'POST /api/auth/login succeeds with correct password', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.token) throw new Error('Missing token in login response');
    authToken = data.token; // Update with new session
  });

  await runTest('Auth', 'POST /api/auth/login rejects incorrect password with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword999!' }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // ----------------------------------------------------------------
  // 3. Threads & Sessions
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 3: Chat Thread Lifecycle');
  await runTest('Threads', 'POST /api/threads creates a new chat thread', async () => {
    const res = await fetch(`${BASE_URL}/api/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ title: 'Architectural Review Thread' }),
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.id || data.title !== 'Architectural Review Thread') {
      throw new Error(`Invalid thread: ${JSON.stringify(data)}`);
    }
    testThreadId = data.id;
  });

  await runTest('Threads', 'GET /api/threads lists existing chat threads', async () => {
    const res = await fetch(`${BASE_URL}/api/threads`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.some((t: any) => t.id === testThreadId)) {
      throw new Error('Created thread not found in list');
    }
  });

  // ----------------------------------------------------------------
  // 4. Multi-Agent Pipeline & Live AI Execution
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 4: Multi-Agent Council Live AI Pipeline');
  await runTest('Multi-Agent', 'POST /api/multi-agent requires authentication', async () => {
    const res = await fetch(`${BASE_URL}/api/multi-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Test without auth' }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await runTest('Multi-Agent', 'POST /api/multi-agent executes live 3-model deliberation ring', async () => {
    const userPrompt = 'Explain the difference between optimistic and pessimistic locking in 2 bullet points.';
    const res = await fetch(`${BASE_URL}/api/multi-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ prompt: userPrompt, threadId: testThreadId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    testTurnId = data.turnId;

    // Check Turn attributes
    if (!data.turnId || !data.consensusSolution || !data.agentResponses) {
      throw new Error(`Turn structure invalid: ${JSON.stringify(data).slice(0, 200)}`);
    }

    // Verify 3 distinct agent responses
    if (data.agentResponses.length !== 3) {
      throw new Error(`Expected 3 agent responses, got ${data.agentResponses.length}`);
    }

    // Check each agent response is genuine live text and has peer optimizer metadata
    for (const r of data.agentResponses) {
      if (!r.answer || r.answer.length < 20) {
        throw new Error(`Agent ${r.agentName} produced empty or too short answer`);
      }
      if (r.answer.startsWith('### Live Model Error')) {
        throw new Error(`Agent ${r.agentName} failed with error: ${r.answer}`);
      }
      if (!r.optimizedByAgentName || !r.receivedPrompt) {
        throw new Error(`Agent ${r.agentName} missing peer optimization metadata`);
      }
    }

    // Check discussion rounds
    if (!data.discussionRounds || data.discussionRounds.length < 2) {
      throw new Error('Missing discussion rounds');
    }
  });

  await runTest('Multi-Agent', 'GET /api/threads/:threadId/messages returns persisted turn with full schema', async () => {
    const res = await fetch(`${BASE_URL}/api/threads/${testThreadId}/messages`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const turns = await res.json();
    if (!Array.isArray(turns) || turns.length === 0) {
      throw new Error('No turns found in thread');
    }
    const found = turns.find((t: any) => t.turnId === testTurnId);
    if (!found) throw new Error(`Turn ${testTurnId} not found in thread messages`);
    if (found.agentResponses.length !== 3) throw new Error('Persisted turn does not have 3 agent responses');
  });

  // ----------------------------------------------------------------
  // 5. Database Direct Integrity Check
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 5: Supabase Database Integrity Verification');
  await runTest('Database', 'Direct query verifies multi_agent_turns row in PostgreSQL', async () => {
    const [row] = await db
      .select()
      .from(multiAgentTurns)
      .where(eq(multiAgentTurns.id, testTurnId))
      .limit(1);

    if (!row) throw new Error(`Row ${testTurnId} not found in PostgreSQL`);
    if (!row.optimizedPrompt || row.agentResponses.length !== 3) {
      throw new Error('Incomplete data stored in multi_agent_turns');
    }
  });

  // ----------------------------------------------------------------
  // 6. Users Endpoint
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 6: Users Management Endpoint');
  await runTest('Users', 'GET /api/users lists users with authentication', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Expected array of users');
  });

  // ----------------------------------------------------------------
  // 7. Logout & Session Invalidation
  // ----------------------------------------------------------------
  console.log('\n➡️ Suite 7: Session Termination');
  await runTest('Auth', 'POST /api/auth/logout revokes session', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: authToken }),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('Logout failed');
  });

  await runTest('Auth', 'Revoked token is rejected by /api/auth/me with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.status !== 401) throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
  });

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log('\n======================================================');
  console.log('                 TEST SUMMARY REPORT                  ');
  console.log('======================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passed:          ${passedCount}`);
  console.log(`Failed:          ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFailed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.error(`- [${r.suite}] ${r.test}: ${r.details}`);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL FEATURES TESTED AND PASSING BEAUTIFULLY!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
