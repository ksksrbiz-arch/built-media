import type { Context } from '@netlify/functions';
import { authenticate, unauthorized } from './_shared/auth';
import { getServiceClient } from './_shared/supabase';
import { json, badRequest, serverError } from './_shared/http';

export default async (req: Request, _context: Context): Promise<Response> => {
  const user = await authenticate(req.headers.get('authorization') ?? undefined);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
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
