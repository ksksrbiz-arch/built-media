import type { Config } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * TEMPORARY: diagnose why /api/me is returning 401 for valid Supabase tokens.
 * Remove this file before going to production.
 */
export default async (req: Request): Promise<Response> => {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  const env = {
    VITE_SUPABASE_URL:           !!process.env.VITE_SUPABASE_URL,
    SUPABASE_DATABASE_URL:       !!process.env.SUPABASE_DATABASE_URL,
    VITE_SUPABASE_DATABASE_URL:  !!process.env.VITE_SUPABASE_DATABASE_URL,
    VITE_SUPABASE_ANON_KEY:      !!process.env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_ANON_KEY:           !!process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY:           !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:       !!process.env.STRIPE_WEBHOOK_SECRET,
    APP_URL:                     process.env.APP_URL,
  };

  const url = (
    process.env.VITE_SUPABASE_URL
    ?? process.env.SUPABASE_DATABASE_URL
    ?? process.env.VITE_SUPABASE_DATABASE_URL
    ?? ''
  );
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey    = process.env.SUPABASE_ANON_KEY ?? '';

  const result: Record<string, unknown> = {
    env,
    resolved_url: url,
    has_service_key: !!serviceKey,
    has_anon_key: !!anonKey,
    has_token: !!token,
    token_alg: token ? JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()).alg : null,
  };

  if (token && url && serviceKey) {
    try {
      const supabase = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.getUser(token);
      result.getUser_error = error ? { message: error.message, status: (error as unknown as {status?: number}).status } : null;
      result.getUser_user_id = data?.user?.id ?? null;
      result.getUser_user_email = data?.user?.email ?? null;
    } catch (e: unknown) {
      result.getUser_throw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = { path: '/api/_debug' };
