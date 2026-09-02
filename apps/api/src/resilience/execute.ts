import CircuitBreaker from 'opossum';

export interface ResilienceOptions {
  errorThresholdPercentage: number;
  resetTimeoutMs: number;
  retries: number;
  timeoutMs: number;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function resilientOperation<TArgs extends unknown[], TResult>(
  operation: (...args: TArgs) => Promise<TResult>,
  options: ResilienceOptions,
): (...args: TArgs) => Promise<TResult> {
  const breaker = new CircuitBreaker(operation, {
    errorThresholdPercentage: options.errorThresholdPercentage,
    resetTimeout: options.resetTimeoutMs,
    timeout: options.timeoutMs,
  });

  return async (...args: TArgs) => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= options.retries; attempt += 1) {
      try {
        return (await breaker.fire(...args)) as TResult;
      } catch (error) {
        lastError = error;
        if (attempt < options.retries)
          await wait(50 * 2 ** attempt + Math.floor(Math.random() * 25));
      }
    }
    throw lastError;
  };
}
