import type { Context } from '@netlify/functions';
import { authenticate, unauthorized } from './_shared/auth';
import { getServiceClient } from './_shared/supabase';
import { json, serverError } from './_shared/http';

export default async (req: Request, _context: Context): Promise<Response> => {
  const user = await authenticate(req.headers.get('authorization') ?? undefined);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const supabase = getServiceClient();
  const { data, error, count } = await supabase
    .from('clips')
    .select('id, source_url, source_title, engine, status, output, error_message, created_at, updated_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return serverError('failed to list clips', error);

  return json({ clips: data ?? [], total: count ?? 0, limit, offset });
};
