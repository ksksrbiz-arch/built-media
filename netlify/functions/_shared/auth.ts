import { timingSafeEqual } from 'node:crypto';
import { getServiceClient } from './supabase';

export interface AuthedUser {
  id: string;
  email?: string;
  /** How the caller authenticated. 'service' = trusted first-party backend. */
  via?: 'user' | 'service';
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

  // Capture env diagnostic fingerprint (safe — first 8 + last 4 chars only)
  const fp = (v: string | undefined) =>
    v ? `${v.slice(0, 8)}...${v.slice(-4)}(${v.length})` : 'MISSING';
  const envFp = {
    SUPABASE_DATABASE_URL: fp(process.env.SUPABASE_DATABASE_URL),
    VITE_SUPABASE_URL:     fp(process.env.VITE_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: fp(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_ANON_KEY: fp(process.env.SUPABASE_ANON_KEY),
  };

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      return {
        user: null,
        debug: debug ? {
          stage: 'getUser',
          detail: `${error.name}: ${error.message} | env=${JSON.stringify(envFp)}`,
        } : undefined,
      };
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

/** Constant-time string compare that tolerates differing lengths. */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Service-to-service auth for trusted first-party backends (e.g. UnifyOne).
 *
 * A caller presenting the shared key in the `x-built-media-key` header acts on
 * behalf of the configured service user (`BUILT_MEDIA_SERVICE_USER_ID`, which
 * must be a real Supabase auth.users id so clip/usage FKs are satisfied).
 * Quota enforcement is skipped for service callers — the upstream platform is
 * expected to meter usage on its own side.
 *
 * Returns null when the service key is not configured or does not match, so
 * callers can fall back to Supabase JWT auth.
 */
export function authenticateService(req: Request): AuthedUser | null {
  const configured = (process.env.BUILT_MEDIA_API_KEY || '').trim();
  if (!configured) return null;

  const provided = (req.headers.get('x-built-media-key') || '').trim();
  if (!provided || !safeKeyEqual(provided, configured)) return null;

  const serviceUserId = (process.env.BUILT_MEDIA_SERVICE_USER_ID || '').trim();
  if (!serviceUserId) return null;

  return { id: serviceUserId, via: 'service' };
}

/**
 * Resolve the caller from either a service key (preferred for first-party
 * backends) or a Supabase user JWT. Returns null when neither succeeds.
 */
export async function authenticateRequest(req: Request): Promise<AuthedUser | null> {
  const service = authenticateService(req);
  if (service) return service;
  return authenticate(req.headers.get('authorization') ?? undefined);
}

export function unauthorized(debugInfo?: AuthResult['debug']): Response {
  const body: Record<string, unknown> = { error: 'unauthorized' };
  if (debugInfo) body.debug = debugInfo;
  return new Response(
    JSON.stringify(body),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
