import { getServiceClient } from './supabase';

export interface AuthedUser {
  id: string;
  email?: string;
}

export interface AuthResult {
  user: AuthedUser | null;
  // diagnostic context (only populated when env exposes DEBUG_AUTH=1)
  debug?: {
    stage: string;
    detail: string;
  };
}

/**
 * Verify a Supabase JWT from the Authorization header.
 * Returns { user } on success, or { user: null, debug } on failure.
 */
export async function authenticateVerbose(authHeader: string | undefined): Promise<AuthResult> {
  const debug = process.env.DEBUG_AUTH === '1';

  if (!authHeader) {
    return { user: null, debug: debug ? { stage: 'header', detail: 'missing' } : undefined };
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) {
    return { user: null, debug: debug ? { stage: 'token', detail: 'empty after Bearer strip' } : undefined };
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { user: null, debug: debug ? { stage: 'client', detail } : undefined };
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      return { user: null, debug: debug ? { stage: 'getUser', detail: `${error.name}: ${error.message}` } : undefined };
    }
    if (!data.user) {
      return { user: null, debug: debug ? { stage: 'getUser', detail: 'no user in response' } : undefined };
    }
    return { user: { id: data.user.id, email: data.user.email ?? undefined } };
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return { user: null, debug: debug ? { stage: 'getUser-throw', detail } : undefined };
  }
}

/**
 * Backwards-compatible thin wrapper.
 */
export async function authenticate(authHeader: string | undefined): Promise<AuthedUser | null> {
  const r = await authenticateVerbose(authHeader);
  return r.user;
}

export function unauthorized(debugInfo?: AuthResult['debug']): Response {
  const body: Record<string, unknown> = { error: 'unauthorized' };
  if (debugInfo) body.debug = debugInfo;
  return new Response(
    JSON.stringify(body),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
