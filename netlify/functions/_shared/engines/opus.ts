import { createHmac, timingSafeEqual } from 'crypto';
import type {
  ClipEngine,
  ClipResult,
  CreateJobInput,
  CreateJobResult,
  JobStatus,
  WebhookEvent,
} from './types';

/**
 * OpusEngine — adapter for Opus Clip's API.
 *
 * NOTE: As of build time, Opus Clip's public API surface is limited and may
 * require partner access. This adapter is structured to match the typical
 * "submit URL → async webhook with rendered clips" pattern so that swapping in
 * the real endpoints/payload shape requires only updating field names below.
 *
 * Required env:
 *   OPUS_API_KEY            – bearer token
 *   OPUS_WEBHOOK_SECRET     – HMAC-SHA256 secret for webhook signature
 */

const OPUS_BASE_URL = process.env.OPUS_API_BASE_URL ?? 'https://api.opus.pro/v1';

interface OpusClipPayload {
  url: string;
  thumbnail_url?: string;
  start_time: number;
  end_time: number;
  duration: number;
  caption?: string;
  hook?: string;
  virality?: number;
  aspect_ratio?: string;
}

interface OpusWebhookBody {
  job_id: string;
  status: 'processing' | 'completed' | 'failed';
  clips?: OpusClipPayload[];
  error?: string;
}

function mapOpusClip(c: OpusClipPayload): ClipResult {
  return {
    url: c.url,
    thumbnail: c.thumbnail_url,
    start_seconds: c.start_time,
    end_seconds: c.end_time,
    duration_seconds: c.duration,
    caption: c.caption,
    hook: c.hook,
    virality_score: c.virality,
    aspect_ratio: (c.aspect_ratio as ClipResult['aspect_ratio']) ?? '9:16',
  };
}

export const opusEngine: ClipEngine = {
  name: 'opus',

  async createJob(input: CreateJobInput): Promise<CreateJobResult> {
    const apiKey = process.env.OPUS_API_KEY;
    if (!apiKey) {
      throw new Error('OPUS_API_KEY not configured');
    }

    const res = await fetch(`${OPUS_BASE_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.jobId,
      },
      body: JSON.stringify({
        source_url: input.sourceUrl,
        webhook_url: input.webhookUrl,
        target_count: input.options?.targetCount ?? 5,
        aspect_ratio: input.options?.aspectRatio ?? '9:16',
        min_duration: input.options?.minDurationSeconds ?? 15,
        max_duration: input.options?.maxDurationSeconds ?? 60,
        metadata: { internal_job_id: input.jobId, user_id: input.userId },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Opus createJob failed: ${res.status} ${text}`);
    }

    const data = await res.json() as { job_id: string; status: string };
    return {
      externalId: data.job_id,
      status: 'processing',
    };
  },

  async getJobStatus(externalId: string): Promise<JobStatus> {
    const apiKey = process.env.OPUS_API_KEY;
    if (!apiKey) throw new Error('OPUS_API_KEY not configured');

    const res = await fetch(`${OPUS_BASE_URL}/jobs/${externalId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return { status: 'failed', error: `HTTP ${res.status}` };
    }

    const data = await res.json() as OpusWebhookBody & { progress?: number };
    if (data.status === 'completed') {
      return {
        status: 'ready',
        progress: 100,
        clips: (data.clips ?? []).map(mapOpusClip),
      };
    }
    if (data.status === 'failed') {
      return { status: 'failed', error: data.error };
    }
    return { status: 'processing', progress: data.progress ?? 0 };
  },

  parseWebhook(headers, rawBody): WebhookEvent | null {
    const secret = process.env.OPUS_WEBHOOK_SECRET;
    if (!secret) {
      console.error('OPUS_WEBHOOK_SECRET not configured — rejecting webhook');
      return null;
    }

    const sig = headers['x-opus-signature'] ?? headers['X-Opus-Signature'];
    if (!sig) return null;

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = sig.replace(/^sha256=/, '');

    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(provided, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }

    let body: OpusWebhookBody;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }

    return {
      externalId: body.job_id,
      status: body.status === 'completed' ? 'ready'
            : body.status === 'failed'    ? 'failed'
                                          : 'processing',
      clips: body.clips?.map(mapOpusClip),
      error: body.error,
    };
  },
};
