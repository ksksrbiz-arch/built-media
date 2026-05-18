import type { Config, Context } from '@netlify/functions';
import { requireAdmin } from './_shared/admin';
import { json, serverError } from './_shared/http';

/**
 * GET /api/admin/users?search=&cursor=&limit=
 * Returns a paginated list of users joined with their subscription summary.
 * Cursor is the created_at timestamp of the last item (descending order).
 */
export default async (req: Request, _context: Context): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '25', 10) || 25, 100);

  let query = ctx.supabase
    .from('profiles')
    .select('id, email, full_name, is_admin, stripe_customer_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit + 1); // fetch one extra to detect "has more"

  if (search) {
    // Strip characters that have special meaning in PostgREST filter syntax
    // (commas, parentheses, asterisks, quotes) to avoid filter injection.
    const safe = search.replace(/[,()*"'%]/g, '');
    if (safe) {
      query = query.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`);
    }
  }
  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data: profiles, error } = await query;
  if (error) return serverError('users query failed', error);

  const rows = profiles ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const userIds = page.map((p) => p.id);

  // Pull subscriptions for this page in one round-trip
  const subsRes = userIds.length
    ? await ctx.supabase
        .from('subscriptions')
        .select('user_id, plan, status, monthly_clip_limit, current_period_end')
        .in('user_id', userIds)
    : { data: [], error: null };
  if (subsRes.error) return serverError('subs query failed', subsRes.error);

  const subsByUser = new Map<string, unknown>();
  for (const s of subsRes.data ?? []) {
    subsByUser.set((s as { user_id: string }).user_id, s);
  }

  const users = page.map((p) => ({
    ...p,
    subscription: subsByUser.get(p.id) ?? null,
  }));

  const nextCursor = hasMore ? page[page.length - 1].created_at : null;
  return json({ users, next_cursor: nextCursor });
};

export const config: Config = { path: '/api/admin/users' };
