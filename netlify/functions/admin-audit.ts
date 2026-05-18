import type { Config, Context } from '@netlify/functions';
import { requireAdmin } from './_shared/admin';
import { json, serverError } from './_shared/http';

/**
 * GET /api/admin/audit?cursor=&limit= — paginated admin_actions feed.
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

  let query = ctx.supabase
    .from('admin_actions')
    .select('id, actor_user_id, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return serverError('audit fetch failed', error);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Resolve actor emails for display.
  const actorIds = Array.from(
    new Set(
      page
        .map((r) => (r as { actor_user_id: string | null }).actor_user_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  let emailsByActor = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles, error: pErr } = await ctx.supabase
      .from('profiles')
      .select('id, email')
      .in('id', actorIds);
    if (pErr) return serverError('actor lookup failed', pErr);
    emailsByActor = new Map(
      (profiles ?? []).map((p) => [
        (p as { id: string }).id,
        (p as { email: string | null }).email ?? '',
      ]),
    );
  }

  const actions = page.map((r) => ({
    ...r,
    actor_email: emailsByActor.get((r as { actor_user_id: string | null }).actor_user_id ?? '') ?? null,
  }));

  return json({ actions, next_cursor: hasMore ? page[page.length - 1].created_at : null });
};

export const config: Config = { path: '/api/admin/audit' };
