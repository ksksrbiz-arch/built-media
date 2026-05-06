import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getUrl(): string {
  return (
    process.env.VITE_SUPABASE_URL
    ?? process.env.SUPABASE_DATABASE_URL
    ?? process.env.VITE_SUPABASE_DATABASE_URL
    ?? ''
  );
}

function getAnonKey(): string {
  return (
    process.env.VITE_SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? ''
  );
}

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted backend code.
 */
export function getServiceClient(): SupabaseClient {
  const url = getUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase URL or service role key not configured');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Request-scoped client that respects the caller's JWT.
 * Use this when you want RLS to enforce row ownership automatically.
 */
export function getUserClient(authHeader: string | undefined): SupabaseClient | null {
  const url = getUrl();
  const anonKey = getAnonKey();
  if (!url || !anonKey || !authHeader) return null;

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
