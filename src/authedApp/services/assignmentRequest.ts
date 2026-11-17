// Bound the entire request, including any wait for an auth token. Aborting only
// the database fetch does not cover a stalled auth/session refresh.
export async function assignmentRequest<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 15000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("The server is taking too long. The assignment may have saved. Refresh the shift before trying again."));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
