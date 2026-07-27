/** Laplacian variance — lower score = more blur. */
export function laplacianVariance(imageData: ImageData): number {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        -4 * gray[i] +
        gray[i - 1] +
        gray[i + 1] +
        gray[i - width] +
        gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

const BLUR_THRESHOLD = 85;

export async function detectBlur(
  dataUrl: string
): Promise<{ score: number; isBlurry: boolean }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ score: 999, isBlurry: false });
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const score = laplacianVariance(imageData);
      resolve({ score, isBlurry: score < BLUR_THRESHOLD });
    };
    img.onerror = () => resolve({ score: 999, isBlurry: false });
    img.src = dataUrl;
  });
}
