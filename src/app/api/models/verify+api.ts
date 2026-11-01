import {
  fetchOpenRouterCatalog,
  getConfiguredModelsFromDb,
  verifyAndPersistFreeModels,
  type VerifiedModelConfig,
} from '../../../lib/ai/model-registry';

function serialize(models: VerifiedModelConfig[]) {
  return models.map((m) => ({
    seatId: m.seatId,
    agentName: m.agentName,
    primaryModel: m.primaryModel,
    fallbackModels: m.fallbackModels,
    provider: m.provider,
    isFree: m.isFree,
    isAvailable: m.isAvailable,
    latencyMs: m.latencyMs,
    verifiedAt:
      m.verifiedAt instanceof Date ? m.verifiedAt.toISOString() : new Date(m.verifiedAt).toISOString(),
  }));
}

/**
 * Runs the full verification (catalog check + availability/latency probes),
 * persists the result in `verified_free_models`, and returns it.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    let deep = true;
    try {
      const body = await request.json();
      if (body && typeof body.deep === 'boolean') deep = body.deep;
    } catch {
      // No body provided — default to a full deep verification.
    }

    const [models, catalog] = await Promise.all([
      verifyAndPersistFreeModels({ deep, probeTimeoutMs: 5000, force: true }),
      fetchOpenRouterCatalog().catch(() => null),
    ]);

    return Response.json({
      success: true,
      deep,
      elapsedMs: Date.now() - startedAt,
      catalogSize: catalog?.size ?? null,
      models: serialize(models),
    });
  } catch (error: any) {
    console.error('Model verification error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Failed to verify free models.' },
      { status: 500 }
    );
  }
}

/**
 * Lightweight GET: verifies against the live catalog and returns the models
 * persisted in PostgreSQL (add `?deep=1` to also run latency probes).
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const deep = ['1', 'true', 'yes'].includes((url.searchParams.get('deep') || '').toLowerCase());

    const models = deep
      ? await verifyAndPersistFreeModels({ deep: true, probeTimeoutMs: 5000, force: true })
      : await verifyAndPersistFreeModels({ deep: false });

    return Response.json({
      success: true,
      deep,
      elapsedMs: Date.now() - startedAt,
      models: serialize(models),
    });
  } catch (error: any) {
    console.error('Model verification error:', error);
    try {
      const cached = await getConfiguredModelsFromDb(true);
      if (cached.length > 0) {
        return Response.json({
          success: true,
          deep: false,
          degraded: true,
          elapsedMs: Date.now() - startedAt,
          error: error?.message || 'Live verification failed; returning last persisted models.',
          models: serialize(cached),
        });
      }
    } catch {
      // fall through to the error response
    }

    return Response.json(
      { success: false, error: error?.message || 'Failed to verify free models.' },
      { status: 500 }
    );
  }
}
