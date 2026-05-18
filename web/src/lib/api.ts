import { supabase } from './supabase';

export interface ClipOutput {
  url: string;
  thumbnail?: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  caption?: string;
  hook?: string;
  virality_score?: number;
  aspect_ratio?: string;
}

export interface Clip {
  id: string;
  source_url: string;
  source_title?: string;
  engine: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  output: ClipOutput[];
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface MeResponse {
  user: { id: string; email?: string };
  profile: {
    id: string;
    email: string;
    full_name?: string;
    stripe_customer_id?: string;
    is_admin?: boolean;
  } | null;
  subscription: {
    plan: 'free' | 'starter' | 'pro' | 'studio';
    status: string;
    monthly_clip_limit: number;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
  usage: { clips_used: number; clips_limit: number; clips_remaining: number };
}

// ----------------------------- Admin types -----------------------------

export interface AdminOverview {
  users_total: number;
  plan_counts: Record<string, number>;
  clips_this_month: number;
  clips_today: number;
  clips_failed_24h: number;
  mrr_cents: number;
  recent_actions: AdminAuditRow[];
}

export interface AdminAuditRow {
  id: string;
  actor_user_id: string | null;
  actor_email?: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AdminUserSummary {
  id: string;
  email: string | null;
  full_name?: string | null;
  is_admin: boolean;
  stripe_customer_id?: string | null;
  created_at: string;
  subscription: {
    plan: string;
    status: string;
    monthly_clip_limit: number;
    current_period_end: string;
  } | null;
}

export interface AdminUserDetail {
  profile: {
    id: string;
    email: string | null;
    full_name?: string | null;
    is_admin: boolean;
    stripe_customer_id?: string | null;
    created_at: string;
  };
  subscription: {
    plan: string;
    status: string;
    monthly_clip_limit: number;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  } | null;
  usage: { clips_used: number; clips_limit: number; clips_remaining: number };
  recent_clips: Array<{
    id: string;
    source_url: string;
    source_title?: string | null;
    engine: string;
    status: string;
    error_message?: string | null;
    created_at: string;
  }>;
}

export interface AdminClipRow {
  id: string;
  user_id: string;
  user_email?: string | null;
  source_url: string;
  source_title?: string | null;
  engine: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSystem {
  clip_engine: string;
  app_url: string | null;
  stripe_configured: boolean;
  stripe_webhook_configured: boolean;
  opus_configured: boolean;
  stuck_processing_jobs: number;
  last_clip_update: string | null;
  last_subscription_update: string | null;
  server_time: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
    ...(init.headers ?? {}),
  };
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `HTTP ${res.status}`) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  me: () => request<MeResponse>('/api/me'),
  listClips: (limit = 50, offset = 0) =>
    request<{ clips: Clip[]; total: number }>(`/api/clips?limit=${limit}&offset=${offset}`),
  getClip: (id: string) => request<{ clip: Clip }>(`/api/clips/${id}`),
  createClip: (sourceUrl: string, engine?: string) =>
    request<{ id: string; status: string; engine: string; clips: ClipOutput[] }>(
      '/api/clips',
      { method: 'POST', body: JSON.stringify({ source_url: sourceUrl, engine }) },
    ),
  checkout: (plan: 'starter' | 'pro' | 'studio') =>
    request<{ url: string; id: string }>('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  // -------------------- Admin --------------------
  admin: {
    overview: () => request<AdminOverview>('/api/admin/overview'),
    listUsers: (params: { search?: string; cursor?: string | null; limit?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.search) qs.set('search', params.search);
      if (params.cursor) qs.set('cursor', params.cursor);
      if (params.limit) qs.set('limit', String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<{ users: AdminUserSummary[]; next_cursor: string | null }>(
        `/api/admin/users${suffix}`,
      );
    },
    getUser: (id: string) => request<AdminUserDetail>(`/api/admin/users/${id}`),
    updateUser: (
      id: string,
      body: { plan?: string; reset_quota?: boolean; disable?: boolean; is_admin?: boolean },
    ) =>
      request<AdminUserDetail>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    listClips: (params: { status?: string; cursor?: string | null; limit?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.cursor) qs.set('cursor', params.cursor);
      if (params.limit) qs.set('limit', String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<{ clips: AdminClipRow[]; next_cursor: string | null }>(
        `/api/admin/clips${suffix}`,
      );
    },
    getClip: (id: string) => request<{ clip: Clip & { user_id: string; metadata?: unknown } }>(
      `/api/admin/clips/${id}`,
    ),
    clipAction: (id: string, action: 'retry' | 'mark_failed' | 'delete', reason?: string) =>
      request<{ ok: true; action: string }>(`/api/admin/clips/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      }),
    system: () => request<AdminSystem>('/api/admin/system'),
    audit: (cursor?: string | null) => {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      return request<{ actions: AdminAuditRow[]; next_cursor: string | null }>(
        `/api/admin/audit${qs}`,
      );
    },
  },
};
