import { ParseChunk, splitChunkAdaptively } from './intelligentChunker';

interface ParseResult {
  items: any[];
  error?: string;
  confidence?: number;
}

interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  timeout: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  initialDelay: 1500,
  maxDelay: 15000,
  timeout: 90000,
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addJitter(delay: number): number {
  return delay + Math.random() * 1000;
}

async function callWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: number;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

async function callLLMParser(
  chunkText: string,
  supplierName: string,
  documentType: string,
  chunkInfo: string,
  supabaseUrl: string,
  authToken: string
): Promise<ParseResult> {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: chunkText,
        supplierName,
        documentType,
        chunkInfo,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return {
    items: result.lines || result.items || [],
    confidence: result.confidence,
  };
}

export async function parseChunkWithRetry(
  chunk: ParseChunk,
  supplierName: string,
  documentType: string,
  supabaseUrl: string,
  authToken: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<ParseResult> {
  let delay = config.initialDelay;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const chunkInfo = `Chunk ${chunk.chunkNumber} (Pages ${chunk.pageStart}-${chunk.pageEnd}, ${chunk.tokenEstimate} tokens, ${chunk.quality} quality)`;

      console.log(`Attempt ${attempt + 1}/${config.maxRetries} for ${chunkInfo}`);

      const result = await callWithTimeout(
        callLLMParser(
          chunk.text,
          supplierName,
          documentType,
          chunkInfo,
          supabaseUrl,
          authToken
        ),
        config.timeout
      );

      console.log(`Success: ${result.items.length} items parsed`);
      return result;

    } catch (error: any) {
      const isLastAttempt = attempt === config.maxRetries - 1;
      const isTimeout = error.message?.includes('timeout');
      const isRateLimit = error.message?.includes('429') || error.message?.includes('rate');

      console.error(`Attempt ${attempt + 1} failed:`, error.message);

      if (isLastAttempt) {
        if (isTimeout) {
          console.log('All retries exhausted, attempting adaptive split...');
          return await parseWithAdaptiveSplit(
            chunk,
            supplierName,
            documentType,
            supabaseUrl,
            authToken,
            config
          );
        }
        throw error;
      }

      if (isRateLimit) {
        delay = Math.min(delay * 2, config.maxDelay);
      }

      const jitteredDelay = addJitter(delay);
      console.log(`Waiting ${Math.round(jitteredDelay)}ms before retry...`);
      await sleep(jitteredDelay);

      delay = Math.min(delay * 1.5, config.maxDelay);
    }
  }

  throw new Error('Max retries exceeded');
}

async function parseWithAdaptiveSplit(
  chunk: ParseChunk,
  supplierName: string,
  documentType: string,
  supabaseUrl: string,
  authToken: string,
  config: RetryConfig
): Promise<ParseResult> {
  console.log(`Splitting chunk ${chunk.chunkNumber} adaptively...`);

  try {
    const subChunks = await splitChunkAdaptively(chunk);
    const results: ParseResult[] = [];

    for (const subChunk of subChunks) {
      try {
        const subConfig = {
          ...config,
          maxRetries: 2,
          timeout: Math.floor(config.timeout * 0.7),
        };

        const result = await parseChunkWithRetry(
          subChunk,
          supplierName,
          documentType,
          supabaseUrl,
          authToken,
          subConfig
        );

        results.push(result);
      } catch (subError) {
        console.error(`Sub-chunk ${subChunk.id} failed:`, subError);
        results.push({ items: [], error: 'partial_failure' });
      }
    }

    const mergedItems = results.flatMap(r => r.items);
    const hasErrors = results.some(r => r.error);

    return {
      items: mergedItems,
      error: hasErrors ? 'partial_failure' : undefined,
      confidence: 0.7,
    };
  } catch (splitError) {
    console.error('Adaptive split failed:', splitError);
    return { items: [], error: 'split_failed' };
  }
}

export interface ParallelParseOptions {
  concurrency?: number;
  onProgress?: (completed: number, total: number, chunkNumber: number) => void;
  onChunkComplete?: (chunkNumber: number, itemCount: number) => void;
  onChunkFailed?: (chunkNumber: number, error: string) => void;
}

export async function parseChunksInParallel(
  chunks: ParseChunk[],
  supplierName: string,
  documentType: string,
  supabaseUrl: string,
  authToken: string,
  options: ParallelParseOptions = {}
): Promise<ParseResult[]> {
  const {
    concurrency = 5,
    onProgress,
    onChunkComplete,
    onChunkFailed,
  } = options;

  const results: (ParseResult | null)[] = Array(chunks.length).fill(null);
  let completed = 0;
  const total = chunks.length;

  const semaphore = {
    count: concurrency,
    queue: [] as (() => void)[],
    async acquire() {
      if (this.count > 0) {
        this.count--;
        return;
      }
      await new Promise<void>(resolve => this.queue.push(resolve));
    },
    release() {
      if (this.queue.length > 0) {
        const resolve = this.queue.shift()!;
        resolve();
      } else {
        this.count++;
      }
    },
  };

  const workers = chunks.map(async (chunk, index) => {
    await semaphore.acquire();

    try {
      const result = await parseChunkWithRetry(
        chunk,
        supplierName,
        documentType,
        supabaseUrl,
        authToken
      );

      results[index] = result;
      completed++;
      onProgress?.(completed, total, chunk.chunkNumber);
      onChunkComplete?.(chunk.chunkNumber, result.items.length);

    } catch (error: any) {
      console.error(`Chunk ${chunk.chunkNumber} failed permanently:`, error.message);
      results[index] = { items: [], error: error.message };
      completed++;
      onProgress?.(completed, total, chunk.chunkNumber);
      onChunkFailed?.(chunk.chunkNumber, error.message);

    } finally {
      semaphore.release();
    }
  });

  await Promise.all(workers);

  return results.filter((r): r is ParseResult => r !== null);
}
