import { getModelCatalog } from '../../server/ai/catalog';
import { requireUser } from '../../server/auth/session';
import { json, route } from '../../server/http';

/** Available free and locked pro models for the model picker. */
export const GET = route(async (request) => {
  await requireUser(request);
  return json(await getModelCatalog());
});
