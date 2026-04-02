import { DEFAULT_EXECUTE_TIMEOUT_MS, ExecuteTimeoutError } from "../types";

export async function withWalletSendTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DEFAULT_EXECUTE_TIMEOUT_MS
): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new ExecuteTimeoutError(
              `Wallet did not settle sendTransaction within ${timeoutMs}ms.`,
              "wallet_send"
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
