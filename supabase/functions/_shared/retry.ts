// SiteTrack Pro — Sprint 2 shared retry helper.
//
// Exponential backoff helper used by whatsapp_dpr_send + voice_transcribe.
// Deno-compatible (no Node imports).

export interface RetryOptions {
  /** Max attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Base delay in ms. Default 1000. Delay = base * 4^(attempt-1). */
  baseMs?: number;
  /** Optional callback fired on each retry — useful for telemetry. */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  /** Predicate: should this error be retried? Default = retry everything. */
  shouldRetry?: (error: unknown) => boolean;
}

export interface RetryResult<T> {
  ok: boolean;
  result?: T;
  error?: unknown;
  attempts: number;
  totalMs: number;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<RetryResult<T>> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseMs = Math.max(1, opts.baseMs ?? 1000);
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const t0 = Date.now();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn(attempt);
      return { ok: true, result, attempts: attempt, totalMs: Date.now() - t0 };
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !shouldRetry(err)) break;
      const delay = baseMs * Math.pow(4, attempt - 1);
      if (opts.onRetry) opts.onRetry(attempt, err, delay);
      await sleep(delay);
    }
  }
  return {
    ok: false,
    error: lastError,
    attempts: maxAttempts,
    totalMs: Date.now() - t0,
  };
}

/**
 * Pure helper: compute the nth backoff delay. Exposed so callers can
 * preview the schedule.
 */
export function backoffDelay(attempt: number, baseMs = 1000): number {
  if (attempt < 1) return 0;
  return baseMs * Math.pow(4, attempt - 1);
}
