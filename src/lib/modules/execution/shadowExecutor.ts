import { runShadowParser } from '../parsers/plumbing/shadow';
import type { PlumbingParserInput, PlumbingRunResult } from '../parsers/plumbing/types';

export async function executeShadowParser(input: PlumbingParserInput): Promise<PlumbingRunResult> {
  const start = Date.now();
  try {
    const output = runShadowParser(input);
    return { success: true, output, durationMs: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Shadow parser failed',
      durationMs: Date.now() - start,
    };
  }
}
