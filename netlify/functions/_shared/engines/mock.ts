import type {
  ClipEngine,
  CreateJobInput,
  CreateJobResult,
  WebhookEvent,
} from './types';

/**
 * MockEngine — synthetic clips for development & demo.
 * Returns 3 fake clips immediately so the full pipeline (DB write,
 * frontend render, billing check) works end-to-end with no external dependency.
 */
export const mockEngine: ClipEngine = {
  name: 'mock',

  async createJob(input: CreateJobInput): Promise<CreateJobResult> {
    const baseId = input.jobId;
    const clips = [
      {
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnail: 'https://placehold.co/600x800/0f3a5f/d4af37?text=Clip+1',
        start_seconds: 12,
        end_seconds: 38,
        duration_seconds: 26,
        caption: 'The one tip nobody is talking about (and it changes everything)',
        hook: 'Stop scrolling — this hits different',
        virality_score: 87,
        aspect_ratio: '9:16' as const,
      },
      {
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        thumbnail: 'https://placehold.co/600x800/1a5f7a/ffffff?text=Clip+2',
        start_seconds: 124,
        end_seconds: 152,
        duration_seconds: 28,
        caption: 'Most people get this completely wrong. Here is what actually works.',
        hook: 'Watch until the end',
        virality_score: 72,
        aspect_ratio: '9:16' as const,
      },
      {
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
        thumbnail: 'https://placehold.co/600x800/d4af37/0f3a5f?text=Clip+3',
        start_seconds: 245,
        end_seconds: 270,
        duration_seconds: 25,
        caption: 'This single change saved me hours every week.',
        hook: 'Wait, what?',
        virality_score: 64,
        aspect_ratio: '9:16' as const,
      },
    ];

    return {
      externalId: `mock_${baseId}`,
      status: 'ready',
      clips,
    };
  },

  parseWebhook(_headers, _rawBody): WebhookEvent | null {
    // Mock engine never sends webhooks; everything is synchronous.
    return null;
  },
};
