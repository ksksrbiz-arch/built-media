import type { Config, Context } from '@netlify/functions';
import { authenticate, unauthorized } from './_shared/auth';
import { getServiceClient } from './_shared/supabase';
import { json, serverError } from './_shared/http';

export default async (req: Request, _context: Context): Promise<Response> => {
  const user = await authenticate(req.headers.get('authorization') ?? undefined);
  if (!user) return unauthorized();

  const supabase = getServiceClient();
  const [profileRes, subRes, usedRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.rpc('clips_used_this_period', { p_user_id: user.id }),
  ]);

  if (profileRes.error) return serverError('profile fetch failed', profileRes.error);
  if (subRes.error) return serverError('subscription fetch failed', subRes.error);

  const sub = subRes.data;
  const used = Number(usedRes.data ?? 0);
  const limit = sub?.monthly_clip_limit ?? 3;

  return json({
    user: { id: user.id, email: user.email },
    profile: profileRes.data,
    subscription: sub,
    usage: {
      clips_used: used,
      clips_limit: limit,
      clips_remaining: Math.max(0, limit - used),
    },
  });
};

export const config: Config = { path: '/api/me' };
