import type { Config, Context } from '@netlify/functions';
import { authenticate, unauthorized } from './_shared/auth';
import { getServiceClient } from './_shared/supabase';
import { getEngine } from './_shared/engines';
import { json, badRequest, serverError } from './_shared/http';

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const user = await authenticate(req.headers.get('authorization') ?? undefined);
  if (!user) return unauthorized();

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

  // -- Quota check --
  const [{ data: sub }, { data: usedRow }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan, status, monthly_clip_limit, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.rpc('clips_used_this_period', { p_user_id: user.id }),
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

  // -- Insert clip row first, so we have a stable jobId --
  const engine = getEngine(body.engine);
  const { data: clip, error: insertErr } = await supabase
    .from('clips')
    .insert({
      user_id: user.id,
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
      userId: user.id,
      webhookUrl: `${appUrl}/api/webhooks/opus`,
    });

    // Sync engines (mock) return clips inline; persist immediately.
    const update: Record<string, unknown> = {
      external_job_id: result.externalId,
      status: result.status,
    };
    if (result.clips?.length) update.output = result.clips;

    await supabase.from('clips').update(update).eq('id', clip.id);

    // Log usage event (counts toward billing period)
    await supabase.from('usage_events').insert({
      user_id: user.id,
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
};

export const config: Config = { path: '/api/clips' };
