import type { Context } from '@netlify/functions';
import { getEngineByName } from './_shared/engines';
import { getServiceClient } from './_shared/supabase';
import { json } from './_shared/http';

/**
 * Engine completion callback. Currently bound to Opus by route, but the
 * adapter pattern lets us point any engine's webhook at a single handler.
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  // Opus is the default engine for this route, but the registry could route by header in future.
  const engine = getEngineByName('opus');
  if (!engine) return json({ error: 'engine unavailable' }, 500);

  const evt = engine.parseWebhook(headers, rawBody);
  if (!evt) return json({ error: 'invalid webhook' }, 400);

  const supabase = getServiceClient();
  const update: Record<string, unknown> = { status: evt.status };
  if (evt.clips) update.output = evt.clips;
  if (evt.error) update.error_message = evt.error;

  const { error } = await supabase
    .from('clips')
    .update(update)
    .eq('external_job_id', evt.externalId);

  if (error) {
    console.error('webhook db update failed', error);
    return json({ error: 'db update failed' }, 500);
  }

  return json({ ok: true });
};
