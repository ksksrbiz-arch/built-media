import type { Config, Context } from '@netlify/functions';
import { requireAdmin } from './_shared/admin';
import { json, serverError } from './_shared/http';
import { PLANS } from './_shared/stripe';

/**
 * GET /api/admin/overview — KPI snapshot for the admin dashboard.
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const { supabase } = ctx;
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [
    usersRes,
    subsRes,
    clipsMonthRes,
    clipsDayRes,
    clipsFailedRes,
    recentAuditRes,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase
      .from('subscriptions')
      .select('plan, status'),
    supabase
      .from('clips')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    supabase
      .from('clips')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('clips')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', dayAgo.toISOString()),
    supabase
      .from('admin_actions')
      .select('id, actor_user_id, action, target_type, target_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (usersRes.error) return serverError('users count failed', usersRes.error);
  if (subsRes.error) return serverError('subs fetch failed', subsRes.error);

  // Plan breakdown + MRR estimate (active/trialing only)
  const planCounts: Record<string, number> = { free: 0, starter: 0, pro: 0, studio: 0 };
  let mrrCents = 0;
  for (const row of subsRes.data ?? []) {
    const plan = (row as { plan: string }).plan ?? 'free';
    const status = (row as { status: string }).status;
    planCounts[plan] = (planCounts[plan] ?? 0) + 1;
    if (status === 'active' || status === 'trialing') {
      const planDef = PLANS[plan as keyof typeof PLANS];
      if (planDef) {
        mrrCents += planDef.priceUsd * 100;
      }
    }
  }

  return json({
    users_total: usersRes.count ?? 0,
    plan_counts: planCounts,
    clips_this_month: clipsMonthRes.count ?? 0,
    clips_today: clipsDayRes.count ?? 0,
    clips_failed_24h: clipsFailedRes.count ?? 0,
    mrr_cents: mrrCents,
    recent_actions: recentAuditRes.data ?? [],
  });
};

export const config: Config = { path: '/api/admin/overview' };
