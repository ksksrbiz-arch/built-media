import type { Config, Context } from '@netlify/functions';
import { requireAdmin } from './_shared/admin';
import { json, serverError } from './_shared/http';

/**
 * GET /api/admin/system — read-only health snapshot.
 * Surfaces the active clip engine, stuck-job count, and inferred timestamps
 * for the last Stripe / Opus webhook activity.
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const { supabase } = ctx;
  const stuckBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [stuckRes, lastClipUpdate, lastSubUpdate] = await Promise.all([
    supabase
      .from('clips')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('updated_at', stuckBefore),
    // last clip row update is a reasonable proxy for last Opus webhook hit
    supabase
      .from('clips')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // last subscription update is a reasonable proxy for last Stripe webhook hit
    supabase
      .from('subscriptions')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (stuckRes.error) return serverError('stuck count failed', stuckRes.error);

  return json({
    clip_engine: process.env.CLIP_ENGINE ?? 'mock',
    app_url: process.env.APP_URL ?? process.env.URL ?? null,
    stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripe_webhook_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    opus_configured: Boolean(process.env.OPUS_API_KEY),
    stuck_processing_jobs: stuckRes.count ?? 0,
    last_clip_update: lastClipUpdate.data?.updated_at ?? null,
    last_subscription_update: lastSubUpdate.data?.updated_at ?? null,
    server_time: new Date().toISOString(),
  });
};

export const config: Config = { path: '/api/admin/system' };
