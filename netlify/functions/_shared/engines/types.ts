/**
 * ClipEngine — the contract every upstream clipper plugs into.
 * Add a new engine: implement this interface, register it in engines/index.ts.
 */

export interface ClipResult {
  url: string;            // signed/public URL of the rendered clip
  thumbnail?: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  caption?: string;
  hook?: string;
  virality_score?: number; // 0–100, engine-defined
  aspect_ratio?: '9:16' | '1:1' | '16:9';
}

export interface CreateJobInput {
  jobId: string;          // our internal clips.id (use as idempotency key)
  sourceUrl: string;      // YouTube URL or direct video URL
  userId: string;
  webhookUrl: string;     // engine should POST completion here
  options?: {
    targetCount?: number;
    aspectRatio?: '9:16' | '1:1' | '16:9';
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
  };
}

export interface CreateJobResult {
  externalId: string;     // engine's job/task identifier
  status: 'queued' | 'processing' | 'ready' | 'failed';
  clips?: ClipResult[];   // some engines (mock) return synchronously
}

export interface JobStatus {
  status: 'queued' | 'processing' | 'ready' | 'failed';
  progress?: number;      // 0–100
  clips?: ClipResult[];
  error?: string;
}

export interface WebhookEvent {
  externalId: string;
  status: 'processing' | 'ready' | 'failed';
  clips?: ClipResult[];
  error?: string;
}

export interface ClipEngine {
  /** Stable identifier persisted in clips.engine */
  readonly name: string;

  /** Submit a job. Should be idempotent on input.jobId. */
  createJob(input: CreateJobInput): Promise<CreateJobResult>;

  /** Optional polling fallback for engines without webhooks. */
  getJobStatus?(externalId: string): Promise<JobStatus>;

  /** Validate signature + parse webhook body. Return null to reject. */
  parseWebhook(headers: Record<string, string>, rawBody: string): WebhookEvent | null;
}
