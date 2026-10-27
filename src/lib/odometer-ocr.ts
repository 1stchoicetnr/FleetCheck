/** Reads digits from an odometer photo. The language data loads the first time. */
export async function recognizeOdometerDigits(dataUrl: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
    });
    const result = await worker.recognize(dataUrl);
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}
