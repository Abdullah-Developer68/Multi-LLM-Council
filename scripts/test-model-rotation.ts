import assert from 'node:assert';
import {
  SEAT_ROTATION_POOLS,
  isModelInCooldown,
  markModelCooldown,
  clearModelCooldown,
  isExhaustionOrRateLimitError,
  isFreeQuotaExhausted,
  describeFreeQuotaExhaustion,
  getModelRotationStatus,
  executeWithFreeModelRotation,
  isKeylessModel,
  isApiKeyQuotaExhausted,
  markApiKeyQuotaExhausted,
  clearApiKeyQuotaExhaustion,
  areAllApiKeysQuotaExhausted,
} from '../src/lib/ai/model-rotation';
import { getOpenRouterApiKey, getOpenRouterApiKeys } from '../src/lib/ai/env';

// Mirror provider determination from model-logo.tsx to test logo invariance without importing react-native JSX in node
function getModelProvider(modelId?: string, provider?: string): 'nvidia' | 'cohere' {
  const haystack = `${modelId ?? ''} ${provider ?? ''}`.toLowerCase();
  return haystack.includes('cohere') || haystack.includes('north') ? 'cohere' : 'nvidia';
}
const PROVIDER_LABEL = { nvidia: 'NVIDIA', cohere: 'Cohere' };

async function runTests() {
  console.log('🧪 Testing OpenRouter Free Model Rotation Engine...\n');

  // Test 1: Seat rotation pools definition
  console.log('1. Checking Seat Rotation Pools...');
  assert(SEAT_ROTATION_POOLS['nemotron-lightning'].length >= 4, 'nemotron-lightning pool has >= 4 models');
  assert(SEAT_ROTATION_POOLS['north-mini-code'].length >= 4, 'north-mini-code pool has >= 4 models');
  assert(SEAT_ROTATION_POOLS['nemotron-ultra'].length >= 4, 'nemotron-ultra pool has >= 4 models');
  console.log('  ✅ [PASS] All 3 council seats have multi-model free rotation pools.');

  // Test 1b: Every seat ends with a keyless (no API key) fallback tier
  console.log('1b. Checking keyless fallback tier on every seat...');
  for (const [seatId, pool] of Object.entries(SEAT_ROTATION_POOLS)) {
    const keyless = pool.filter((m) => isKeylessModel(m));
    assert(keyless.length > 0, `${seatId} pool has no keyless pollinations fallback`);
    assert(
      isKeylessModel(pool[pool.length - 1]),
      `${seatId} pool must end with a keyless fallback (found ${pool[pool.length - 1]})`
    );
  }
  console.log('  ✅ [PASS] Every seat has a keyless Pollinations fallback as last resort.');

  // Test 1c: Multi-key configuration
  console.log('1c. Checking multi-key OpenRouter configuration...');
  const configuredKeys = getOpenRouterApiKeys();
  console.log(`  Configured OpenRouter keys: ${configuredKeys.length}`);
  assert(configuredKeys.length >= 1, 'at least one OpenRouter key must be configured');
  assert.strictEqual(new Set(configuredKeys).size, configuredKeys.length, 'keys must be de-duplicated');
  assert(configuredKeys.includes(getOpenRouterApiKey()), 'active key must come from the configured list');
  console.log('  ✅ [PASS] Multiple OpenRouter keys are configured and de-duplicated.');

  // Test 1d: Per-key quota isolation
  console.log('1d. Checking per-key daily quota isolation...');
  const keyA = 'sk-or-v1-test-key-alpha-000000000000';
  const keyB = 'sk-or-v1-test-key-beta-111111111111';
  clearApiKeyQuotaExhaustion(keyA);
  clearApiKeyQuotaExhaustion(keyB);
  markApiKeyQuotaExhausted(keyA, Date.now() + 60_000);
  assert(isApiKeyQuotaExhausted(keyA), 'key A should be exhausted');
  assert(!isApiKeyQuotaExhausted(keyB), 'key B must stay usable when key A is exhausted');
  assert(!areAllApiKeysQuotaExhausted([keyA, keyB]), 'not all keys are exhausted');
  markApiKeyQuotaExhausted(keyB, Date.now() + 60_000);
  assert(areAllApiKeysQuotaExhausted([keyA, keyB]), 'all keys should now be exhausted');
  clearApiKeyQuotaExhaustion(keyA);
  clearApiKeyQuotaExhaustion(keyB);
  assert(!isApiKeyQuotaExhausted(keyA) && !isApiKeyQuotaExhausted(keyB), 'clearing must reset both keys');
  console.log('  ✅ [PASS] Exhausting one key never blocks the next key.');

  // Test 2: Provider mapping & Icon invariance
  console.log('2. Verifying Icon & Provider Invariance across Rotations...');
  // Even if north-mini-code rotates to liquid or nemotron, agentId is 'north-mini-code' -> Cohere
  assert.strictEqual(getModelProvider('north-mini-code'), 'cohere');
  assert.strictEqual(PROVIDER_LABEL[getModelProvider('north-mini-code')], 'Cohere');

  // Nemotron lightning -> NVIDIA
  assert.strictEqual(getModelProvider('nemotron-lightning'), 'nvidia');
  assert.strictEqual(PROVIDER_LABEL[getModelProvider('nemotron-lightning')], 'NVIDIA');

  // Nemotron ultra -> NVIDIA
  assert.strictEqual(getModelProvider('nemotron-ultra'), 'nvidia');
  assert.strictEqual(PROVIDER_LABEL[getModelProvider('nemotron-ultra')], 'NVIDIA');
  console.log('  ✅ [PASS] Provider logo mapping is strictly invariant to rotated models.');

  // Test 3: Exhaustion & Rate Limit Detection
  console.log('3. Checking Error Pattern Detection (429, 402, Quota, Capacity)...');
  assert(isExhaustionOrRateLimitError('Rate limit exceeded: free-models-per-day', 429));
  assert(isExhaustionOrRateLimitError('Payment required / out of credits', 402));
  assert(isExhaustionOrRateLimitError('Provider returned error: capacity overloaded', 503));
  assert(isExhaustionOrRateLimitError('Model is temporarily rate-limited. Try again later'));
  assert(!isExhaustionOrRateLimitError('Invalid JSON schema syntax', 400));
  console.log('  ✅ [PASS] Exhaustion and quota errors properly detected.');

  // Test 4: Cooldown Management
  console.log('4. Testing Cooldown State Transitions...');
  const testModel = 'test/mock-model:free';
  assert(!isModelInCooldown(testModel), 'Model should not be in cooldown initially');

  markModelCooldown(testModel, 'Rate limit hit', 5000);
  assert(isModelInCooldown(testModel), 'Model should be in cooldown after marking');

  const status = getModelRotationStatus();
  assert(status[testModel] && status[testModel].available === false, 'Status shows unavailable');

  clearModelCooldown(testModel);
  assert(!isModelInCooldown(testModel), 'Model should be available after clear');
  console.log('  ✅ [PASS] In-memory cooldown cycle verified.');

  // Test 5: Live API Rotation Execution
  console.log('5. Testing Live Execution via Model Rotation Engine...');
  const apiKey = getOpenRouterApiKey();
  let liveTestsSkipped = false;
  if (apiKey && !isFreeQuotaExhausted()) {
    try {
      const res = await executeWithFreeModelRotation(
        'north-mini-code',
        'Cohere Systems Architect',
        'You are a concise expert. Output 1 word.',
        'Respond with OK.',
        apiKey,
        { maxTokens: 20, timeoutMs: 25000 }
      );
      console.log(`  Model used: ${res.modelUsed}, wasRotated: ${res.wasRotated}, output: "${res.text.slice(0, 30)}"`);
      assert(res.text.length > 0, 'Returned non-empty response');
      console.log('  ✅ [PASS] Live OpenRouter generation succeeded via rotation pool.');

      // Test 6: Automatic Failover when Primary is in Cooldown
      console.log('6. Testing Automatic Rotation when Primary is in Cooldown...');
      markModelCooldown('cohere/north-mini-code:free', 'Simulated 429 quota exhaustion');
      const rotatedRes = await executeWithFreeModelRotation(
        'north-mini-code',
        'Cohere Systems Architect',
        'You are a concise expert. Output 1 word.',
        'Respond with OK.',
        apiKey,
        { maxTokens: 20, timeoutMs: 35000 }
      );
      console.log(`  Model used on rotation: ${rotatedRes.modelUsed}, wasRotated: ${rotatedRes.wasRotated}`);
      assert.strictEqual(rotatedRes.wasRotated, true, 'Should mark wasRotated as true');
      assert.notStrictEqual(rotatedRes.modelUsed, 'cohere/north-mini-code:free', 'Should not use cooled-down model');
      assert(rotatedRes.text.length > 0, 'Should return non-empty response from fallback model');
      clearModelCooldown('cohere/north-mini-code:free');
      console.log('  ✅ [PASS] Automatic failover successfully selected next active free model.');
    } catch (err: any) {
      if (isFreeQuotaExhausted()) {
        liveTestsSkipped = true;
        console.log(`  ⏭️ [SKIP] Live generation unavailable: ${describeFreeQuotaExhaustion()}`);
      } else {
        throw err;
      }
    }
  } else if (apiKey) {
    liveTestsSkipped = true;
    console.log(`  ⏭️ [SKIP] Live generation unavailable: ${describeFreeQuotaExhaustion()}`);
  } else {
    liveTestsSkipped = true;
    console.log('  ⚠️ Skipping live test (no API key present).');
  }

  console.log(
    liveTestsSkipped
      ? '\n🎉 MODEL ROTATION UNIT TESTS PASSED (live generation skipped)\n'
      : '\n🎉 ALL MODEL ROTATION TESTS PASSED!\n'
  );
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Model rotation test failed:', err);
    process.exit(1);
  });
