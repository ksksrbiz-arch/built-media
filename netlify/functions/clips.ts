import type { Config, Context } from '@netlify/functions';
import { authenticate, unauthorized } from './_shared/auth';
import { getServiceClient } from './_shared/supabase';
import { getEngine } from './_shared/engines';
import { json, badRequest, serverError } from './_shared/http';

/**
 * REST endpoint at /api/clips
 *   GET  → list user's clips (paginated)
 *   POST → create a new clip job (auth + quota + engine dispatch)
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  const user = await authenticate(req.headers.get('authorization') ?? undefined);
  if (!user) return unauthorized();

  if (req.method === 'GET')  return listClips(req, user.id);
  if (req.method === 'POST') return createClip(req, user.id);
  return json({ error: 'method not allowed' }, 405);
};

export const config: Config = { path: '/api/clips' };

// ------------------------------- GET /api/clips -------------------------------

async function listClips(req: Request, userId: string): Promise<Response> {
  const url = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const supabase = getServiceClient();
  const { data, error, count } = await supabase
    .from('clips')
    .select(
      'id, source_url, source_title, engine, status, output, error_message, created_at, updated_at',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return serverError('failed to list clips', error);
  return json({ clips: data ?? [], total: count ?? 0, limit, offset });
}

// ------------------------------- POST /api/clips ------------------------------

async function createClip(req: Request, userId: string): Promise<Response> {
  let body: { source_url?: string; engine?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid JSON');
  }

  const sourceUrl = body.source_url?.trim();
  if (!sourceUrl) return badRequest('source_url required');
  if (!/^https?:\/\//.test(sourceUrl)) return badRequest('source_url must be http(s)');

  const supabase = getServiceClient();

  // -- Lazy period rollover for free tier --
  // Paid plans are rolled forward by Stripe webhooks; free plans need this
  // server-side check to reset their 30-day window.
  await supabase.rpc('ensure_period_current', { p_user_id: userId });

  // -- Quota check --
  const [{ data: sub }, { data: usedRow }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan, status, monthly_clip_limit, current_period_end')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.rpc('clips_used_this_period', { p_user_id: userId }),
  ]);

  if (!sub) return serverError('subscription record missing');
  if (sub.status !== 'active' && sub.status !== 'trialing') {
    return json({ error: 'subscription_inactive', plan: sub.plan }, 402);
  }

  const used = Number(usedRow ?? 0);
  if (used >= sub.monthly_clip_limit) {
    return json(
      {
        error: 'quota_exceeded',
        used,
        limit: sub.monthly_clip_limit,
        plan: sub.plan,
        message: `You've used all ${sub.monthly_clip_limit} clips on the ${sub.plan} plan. Upgrade to keep clipping.`,
      },
      402,
    );
  }

  // -- Insert clip row --
  const engine = getEngine(body.engine);
  const { data: clip, error: insertErr } = await supabase
    .from('clips')
    .insert({
      user_id: userId,
      source_url: sourceUrl,
      engine: engine.name,
      status: 'queued',
    })
    .select()
    .single();

  if (insertErr || !clip) return serverError('failed to create clip', insertErr);

  // -- Dispatch to engine --
  try {
    const appUrl = process.env.APP_URL ?? process.env.URL ?? '';
    const result = await engine.createJob({
      jobId: clip.id,
      sourceUrl,
      userId,
      webhookUrl: `${appUrl}/api/webhooks/opus`,
    });

    const update: Record<string, unknown> = {
      external_job_id: result.externalId,
      status: result.status,
    };
    if (result.clips?.length) update.output = result.clips;

    await supabase.from('clips').update(update).eq('id', clip.id);

    await supabase.from('usage_events').insert({
      user_id: userId,
      clip_id: clip.id,
      event_type: 'clip_created',
    });

    return json({
      id: clip.id,
      status: result.status,
      engine: engine.name,
      clips: result.clips ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'engine error';
    await supabase
      .from('clips')
      .update({ status: 'failed', error_message: message })
      .eq('id', clip.id);
    return serverError('engine dispatch failed', message);
  }
}
