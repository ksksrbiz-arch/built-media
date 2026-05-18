import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateVerbose, type AuthedUser } from './auth';
import { getServiceClient } from './supabase';
import { json } from './http';

export interface AdminContext {
  user: AuthedUser;
  supabase: SupabaseClient;
}

/**
 * Guard that authenticates the caller and verifies they are an admin
 * (profiles.is_admin = true). On failure returns a Response that callers
 * should return directly; on success returns an AdminContext.
 */
export async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  const auth = await authenticateVerbose(req.headers.get('authorization') ?? undefined);
  if (!auth.user) {
    return json({ error: 'unauthorized', ...(auth.debug ? { debug: auth.debug } : {}) }, 401);
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error) {
    console.error('admin: profile lookup failed', error);
    return json({ error: 'forbidden' }, 403);
  }
  if (!data?.is_admin) {
    return json({ error: 'forbidden' }, 403);
  }

  return { user: auth.user, supabase };
}

export interface LogAdminActionInput {
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append an entry to public.admin_actions. Failure is logged but never
 * thrown — audit logging must not block the primary mutation.
 */
export async function logAdminAction(
  supabase: SupabaseClient,
  input: LogAdminActionInput,
): Promise<void> {
  const { error } = await supabase.from('admin_actions').insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error('admin: failed to write audit row', error, input);
  }
}
