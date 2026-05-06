import type { ClipEngine } from './types';
import { mockEngine } from './mock';
import { opusEngine } from './opus';

/**
 * Engine registry. Add new clippers here.
 * The active engine is selected by env CLIP_ENGINE, with a safe fallback to mock.
 */
const ENGINES: Record<string, ClipEngine> = {
  mock: mockEngine,
  opus: opusEngine,
  // Future: vizard, klap, submagic, etc.
  // vizard: vizardEngine,
};

export function getEngine(name?: string): ClipEngine {
  const requested = (name ?? process.env.CLIP_ENGINE ?? 'mock').toLowerCase();
  const engine = ENGINES[requested];
  if (!engine) {
    console.warn(`Unknown engine "${requested}" — falling back to mock`);
    return mockEngine;
  }
  return engine;
}

export function getEngineByName(name: string): ClipEngine | null {
  return ENGINES[name.toLowerCase()] ?? null;
}

export type { ClipEngine } from './types';
