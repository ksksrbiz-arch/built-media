import type { Config, Context } from '@netlify/functions';
import { authenticate, unauthorized } from './_shared/auth';
import { getServiceClient } from './_shared/supabase';
import { json, badRequest, serverError } from './_shared/http';

/**
 * GET /api/clips/:id — single clip detail
 */
export default async (req: Request, context: Context): Promise<Response> => {
  const user = await authenticate(req.headers.get('authorization') ?? undefined);
  if (!user) return unauthorized();

  // Netlify v2 functions expose URL params via context.params for templated paths
  const id = (context.params as { id?: string } | undefined)?.id
    ?? new URL(req.url).pathname.split('/').pop();
  if (!id) return badRequest('id required');

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return serverError('failed to fetch clip', error);
  if (!data) return json({ error: 'not found' }, 404);

  return json({ clip: data });
};

export const config: Config = { path: '/api/clips/:id' };
