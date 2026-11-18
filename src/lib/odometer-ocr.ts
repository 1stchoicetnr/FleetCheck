/** The mileage reader downloads its engine on first use. Waiting longer than this strands the driver. */
export const OCR_TIMEOUT_MS = 8_000;

export class OcrTimeoutError extends Error {
  constructor() {
    super("Reading the odometer took too long");
    this.name = "OcrTimeoutError";
  }
}

/**
 * Wait for a task, but never longer than `ms`. On timeout the task is left to
 * finish (or fail) on its own and `onTimeout` cleans it up.
 */
export function withTimeout<T>(task: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new OcrTimeoutError());
      }
    }, ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Reads digits from an odometer photo. The engine and language data load from a
 * CDN the first time, so this can be slow or never answer on a weak signal:
 * it gives up after OCR_TIMEOUT_MS and throws OcrTimeoutError.
 */
export async function recognizeOdometerDigits(
  dataUrl: string,
  timeoutMs = OCR_TIMEOUT_MS
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let abandoned = false;
  const run = (async () => {
    const created = await createWorker("eng");
    worker = created;
    if (abandoned) {
      await created.terminate().catch(() => undefined);
      throw new OcrTimeoutError();
    }
    try {
      await created.setParameters({ tessedit_char_whitelist: "0123456789" });
      const result = await created.recognize(dataUrl);
      return result.data.text ?? "";
    } finally {
      await created.terminate().catch(() => undefined);
    }
  })();
  return withTimeout(run, timeoutMs, () => {
    abandoned = true;
    void (worker as { terminate(): Promise<unknown> } | null)?.terminate().catch(() => undefined);
  });
}
