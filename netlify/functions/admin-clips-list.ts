import type { Config, Context } from '@netlify/functions';
import { requireAdmin } from './_shared/admin';
import { json, serverError } from './_shared/http';

const VALID_STATUSES = new Set(['queued', 'processing', 'ready', 'failed']);

/**
 * GET /api/admin/clips?status=&cursor=&limit=
 * Lists clips across all users with optional status filter. Cursor uses created_at.
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '25', 10) || 25, 100);

  let query = ctx.supabase
    .from('clips')
    .select('id, user_id, source_url, source_title, engine, status, error_message, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (status && VALID_STATUSES.has(status)) {
    query = query.eq('status', status);
  }
  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;
  if (error) return serverError('clips query failed', error);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Resolve emails for the users on this page in one round trip.
  const userIds = Array.from(new Set(page.map((c) => (c as { user_id: string }).user_id)));
  let emailsByUser = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles, error: pErr } = await ctx.supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds);
    if (pErr) return serverError('profiles query failed', pErr);
    emailsByUser = new Map(
      (profiles ?? []).map((p) => [
        (p as { id: string }).id,
        (p as { email: string | null }).email ?? '',
      ]),
    );
  }

  const clips = page.map((c) => ({
    ...c,
    user_email: emailsByUser.get((c as { user_id: string }).user_id) ?? null,
  }));

  return json({
    clips,
    next_cursor: hasMore ? page[page.length - 1].created_at : null,
  });
};

export const config: Config = { path: '/api/admin/clips' };
