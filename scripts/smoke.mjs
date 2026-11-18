/**
 * End-to-end smoke test against a running dev server (`npx expo start`).
 *
 *   npm test                  # auth, threads, models, insights (no model quota used)
 *   npm run test:council      # also runs one council turn + consensus (~4 free requests)
 *
 * Creates a throwaway account `smoke+<timestamp>@example.test`.
 * Set API_URL to target another server (default http://localhost:8081).
 */
const BASE = process.env.API_URL ?? 'http://localhost:8081';
const runCouncil = process.argv.includes('--council');
let token = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const email = `smoke+${Date.now()}@example.test`;
check('health', (await call('GET', '/api/health')).status === 200);
check('attachments require auth', (await fetch(`${BASE}/api/attachments`, { method: 'POST' })).status === 401);

const signup = await call('POST', '/api/auth/signup', { email, password: 'correct-horse-9', fullName: 'Smoke Test' });
check('sign up', signup.status === 201 && !!signup.data.token, signup.data.error);
token = signup.data.token ?? '';

check('duplicate sign up rejected', (await call('POST', '/api/auth/signup', { email, password: 'correct-horse-9', fullName: 'X' })).status === 409);
check('wrong password rejected', (await call('POST', '/api/auth/login', { email, password: 'nope' })).status === 401);
const me = await call('GET', '/api/auth/me');
check('session', me.data.user?.email === email);
check('threads list', Array.isArray((await call('GET', '/api/threads')).data.threads));
const models = await call('GET', '/api/models');
check('council status', models.status === 200 && models.data.seats?.length === 3, `quota ${JSON.stringify(models.data.quota)}`);
check('insights', (await call('GET', '/api/insights')).status === 200);

if (runCouncil) {
  const res = await fetch(`${BASE}/api/council`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt: 'In one sentence: what is a B-tree?' }),
  });
  const events = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  const refineDone = events.find((e) => e.type === 'refine:done');
  const done = events.find((e) => e.type === 'done');
  const deltas = events.filter((e) => e.type === 'seat:delta').length;
  check('prompt refiner', !!refineDone?.refinement && !!done?.turn?.refinement, refineDone?.refinement?.model);
  check('council turn streamed', !!done && deltas > 0, `${deltas} token events`);
  for (const r of done?.turn.agentResponses ?? []) {
    check(`  seat ${r.agentId}`, r.status === 'ok', `${r.model} ${r.latencyMs ?? '-'}ms ${r.error ?? ''}`);
  }
  if (done) {
    const synth = await call('POST', `/api/turns/${done.turn.turnId}/synthesize`, {});
    check('consensus', !!synth.data.turn?.synthesis, synth.data.error);
  }
}

check('sign out', (await call('POST', '/api/auth/logout', {})).status === 200);
check('token revoked', (await call('GET', '/api/auth/me')).status === 401);
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
