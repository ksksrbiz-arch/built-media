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
  profile: { id: string; email: string; full_name?: string; stripe_customer_id?: string };
  subscription: {
    plan: 'free' | 'starter' | 'pro' | 'studio';
    status: string;
    monthly_clip_limit: number;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
  usage: { clips_used: number; clips_limit: number; clips_remaining: number };
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
};
