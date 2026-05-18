import type { Config, Context } from '@netlify/functions';
import { requireAdmin, logAdminAction } from './_shared/admin';
import { json, badRequest, serverError } from './_shared/http';

/**
 * /api/admin/clips/:id
 *   GET    → full clip row (admin view, no user_id filter)
 *   POST   body { action: 'retry' | 'mark_failed' | 'delete' }
 */
export default async (req: Request, context: Context): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const id = (context.params as { id?: string } | undefined)?.id
    ?? new URL(req.url).pathname.split('/').pop();
  if (!id) return badRequest('id required');

  const { supabase } = ctx;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('clips')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return serverError('clip fetch failed', error);
    if (!data) return json({ error: 'not found' }, 404);
    return json({ clip: data });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid JSON');
  }

  switch (body.action) {
    case 'retry': {
      const { error } = await supabase
        .from('clips')
        .update({ status: 'queued', error_message: null })
        .eq('id', id);
      if (error) return serverError('retry failed', error);
      await logAdminAction(supabase, {
        actorUserId: ctx.user.id,
        action: 'clip.retry',
        targetType: 'clip',
        targetId: id,
      });
      return json({ ok: true, action: 'retry' });
    }
    case 'mark_failed': {
      const reason = body.reason?.trim() || 'Marked failed by admin';
      const { error } = await supabase
        .from('clips')
        .update({ status: 'failed', error_message: reason })
        .eq('id', id);
      if (error) return serverError('mark_failed failed', error);
      await logAdminAction(supabase, {
        actorUserId: ctx.user.id,
        action: 'clip.mark_failed',
        targetType: 'clip',
        targetId: id,
        metadata: { reason },
      });
      return json({ ok: true, action: 'mark_failed' });
    }
    case 'delete': {
      const { error } = await supabase.from('clips').delete().eq('id', id);
      if (error) return serverError('delete failed', error);
      await logAdminAction(supabase, {
        actorUserId: ctx.user.id,
        action: 'clip.delete',
        targetType: 'clip',
        targetId: id,
      });
      return json({ ok: true, action: 'delete' });
    }
    default:
      return badRequest('action must be one of: retry, mark_failed, delete');
  }
};

export const config: Config = { path: '/api/admin/clips/:id' };
