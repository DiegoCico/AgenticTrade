const MAX_RATE_LIMIT_ATTEMPTS = 4;
const MIN_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 10_000;

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomRetryDelayMs() {
  return Math.floor(MIN_RETRY_DELAY_MS + Math.random() * (MAX_RETRY_DELAY_MS - MIN_RETRY_DELAY_MS + 1));
}

export async function withRateLimitRetry<T>(
  label: string,
  operation: (attempt: number) => Promise<T>,
  maxAttempts = MAX_RATE_LIMIT_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const isRateLimited = error instanceof RateLimitError;
      const hasAttemptsRemaining = attempt < maxAttempts;

      if (!isRateLimited || !hasAttemptsRemaining) {
        throw error;
      }

      const delayMs = randomRetryDelayMs();
      console.warn('[rateLimitRetry] rate limited; retrying after randomized delay', {
        label,
        attempt,
        maxAttempts,
        delayMs,
        error: error.message,
        details: error.details,
      });

      await sleep(delayMs);
    }
  }

  throw new Error(`[rateLimitRetry] exhausted attempts for ${label}`);
}
