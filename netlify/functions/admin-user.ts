import type { Config, Context } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin, logAdminAction } from './_shared/admin';
import { json, badRequest, serverError } from './_shared/http';

type PlanTier = 'free' | 'starter' | 'pro' | 'studio';
const VALID_PLANS: PlanTier[] = ['free', 'starter', 'pro', 'studio'];

// Default monthly clip limits per plan (mirrors stripe.ts PLANS + free trial)
const PLAN_LIMITS: Record<PlanTier, number> = {
  free: 3,
  starter: 30,
  pro: 200,
  studio: 1000,
};

/**
 * /api/admin/users/:id
 *   GET   → full user detail
 *   PATCH → mutate admin-controllable fields (plan, quota reset, disable, is_admin)
 */
export default async (req: Request, context: Context): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const id = (context.params as { id?: string } | undefined)?.id
    ?? new URL(req.url).pathname.split('/').pop();
  if (!id) return badRequest('id required');

  if (req.method === 'GET') return getUser(ctx.supabase, id);
  if (req.method === 'PATCH') return patchUser(req, ctx, id);
  return json({ error: 'method not allowed' }, 405);
};

export const config: Config = { path: '/api/admin/users/:id' };

async function getUser(supabase: SupabaseClient, id: string): Promise<Response> {
  const [profileRes, subRes, usedRes, clipsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('user_id', id).maybeSingle(),
    supabase.rpc('clips_used_this_period', { p_user_id: id }),
    supabase
      .from('clips')
      .select('id, source_url, source_title, engine, status, error_message, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (profileRes.error) return serverError('profile fetch failed', profileRes.error);
  if (!profileRes.data) return json({ error: 'not found' }, 404);
  if (subRes.error) return serverError('subscription fetch failed', subRes.error);
  if (clipsRes.error) return serverError('clips fetch failed', clipsRes.error);

  const sub = subRes.data;
  const used = Number(usedRes.data ?? 0);
  const limit = sub?.monthly_clip_limit ?? 0;

  return json({
    profile: profileRes.data,
    subscription: sub,
    usage: {
      clips_used: used,
      clips_limit: limit,
      clips_remaining: Math.max(0, limit - used),
    },
    recent_clips: clipsRes.data ?? [],
  });
}

interface PatchBody {
  plan?: PlanTier;
  reset_quota?: boolean;
  disable?: boolean;
  is_admin?: boolean;
}

async function patchUser(
  req: Request,
  ctx: { user: { id: string }; supabase: SupabaseClient },
  id: string,
): Promise<Response> {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return badRequest('invalid JSON');
  }

  const { supabase } = ctx;
  const actions: string[] = [];

  // -- Change plan --
  if (body.plan !== undefined) {
    if (!VALID_PLANS.includes(body.plan)) return badRequest('invalid plan');
    const newLimit = PLAN_LIMITS[body.plan];
    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan: body.plan,
        monthly_clip_limit: newLimit,
        // For manual overrides we keep status as-is unless re-activating from canceled
        status: body.plan === 'free' ? 'active' : 'active',
      })
      .eq('user_id', id);
    if (error) return serverError('plan update failed', error);
    actions.push('plan_changed');
    await logAdminAction(supabase, {
      actorUserId: ctx.user.id,
      action: 'user.plan_changed',
      targetType: 'user',
      targetId: id,
      metadata: { plan: body.plan, monthly_clip_limit: newLimit },
    });
  }

  // -- Reset quota: bump current_period_start to now, clearing usage window --
  if (body.reset_quota) {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('subscriptions')
      .update({ current_period_start: nowIso })
      .eq('user_id', id);
    if (error) return serverError('quota reset failed', error);
    actions.push('quota_reset');
    await logAdminAction(supabase, {
      actorUserId: ctx.user.id,
      action: 'user.quota_reset',
      targetType: 'user',
      targetId: id,
      metadata: { current_period_start: nowIso },
    });
  }

  // -- Disable: mark subscription canceled. (Hard-deleting auth.users is risky;
  //    we stop short of that and let the operator do it from Supabase if needed.)
  if (body.disable) {
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'canceled', cancel_at_period_end: true })
      .eq('user_id', id);
    if (error) return serverError('disable failed', error);
    actions.push('disabled');
    await logAdminAction(supabase, {
      actorUserId: ctx.user.id,
      action: 'user.disabled',
      targetType: 'user',
      targetId: id,
    });
  }

  // -- Toggle admin flag --
  if (body.is_admin !== undefined) {
    // Don't allow an admin to remove their own admin flag — avoids accidental lockout.
    if (id === ctx.user.id && body.is_admin === false) {
      return badRequest('cannot revoke own admin access');
    }
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: body.is_admin })
      .eq('id', id);
    if (error) return serverError('admin flag update failed', error);
    actions.push(body.is_admin ? 'admin_granted' : 'admin_revoked');
    await logAdminAction(supabase, {
      actorUserId: ctx.user.id,
      action: body.is_admin ? 'user.admin_granted' : 'user.admin_revoked',
      targetType: 'user',
      targetId: id,
    });
  }

  if (actions.length === 0) return badRequest('no recognised fields to update');
  return getUser(supabase, id);
}
