import { runLiveParser } from '../parsers/plumbing/live';
import type { PlumbingParserInput, PlumbingRunResult } from '../parsers/plumbing/types';

export async function executeLiveParser(input: PlumbingParserInput): Promise<PlumbingRunResult> {
  const start = Date.now();
  try {
    const output = runLiveParser(input);
    return { success: true, output, durationMs: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Live parser failed',
      durationMs: Date.now() - start,
    };
  }
}
