import { getServiceClient } from './supabase';

export interface AuthedUser {
  id: string;
  email?: string;
}

/**
 * Verify a Supabase JWT from the Authorization header.
 * Returns the user record on success, or null on failure.
 */
export async function authenticate(authHeader: string | undefined): Promise<AuthedUser | null> {
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return null;

  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  };
}

export function unauthorized(): Response {
  return new Response(
    JSON.stringify({ error: 'unauthorized' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
