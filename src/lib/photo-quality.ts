import { detectBlur } from "./blur-detection";
import { getImageDimensions } from "./utils";
import type { PhotoAngle, PhotoStep } from "./types";

export interface PhotoQualityResult {
  passed: boolean;
  isBlurry: boolean;
  isPortrait: boolean;
  isLowLight: boolean;
  messages: string[];
  warnings: string[];
}

const LOW_LIGHT_THRESHOLD = 42;

function averageLuminance(imageData: ImageData): number {
  const { data } = imageData;
  const pixels = data.length / 4;
  if (pixels === 0) return 255;

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return sum / pixels;
}

async function detectLowLight(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      resolve(averageLuminance(imageData) < LOW_LIGHT_THRESHOLD);
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

/** Sample live video frame brightness — warning only, never blocks capture. */
export function sampleVideoLowLight(video: HTMLVideoElement): boolean {
  if (!video.videoWidth || !video.videoHeight) return false;

  const size = 80;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  try {
    ctx.drawImage(video, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    return averageLuminance(imageData) < LOW_LIGHT_THRESHOLD;
  } catch {
    return false;
  }
}

export async function checkPhotoQuality(
  dataUrl: string,
  _category: PhotoStep["category"]
): Promise<PhotoQualityResult> {
  const [blur, dims, isLowLight] = await Promise.all([
    detectBlur(dataUrl),
    getImageDimensions(dataUrl),
    detectLowLight(dataUrl),
  ]);

  const isPortrait = dims.width < dims.height;
  const messages: string[] = [];
  const warnings: string[] = [];

  if (blur.isBlurry) {
    messages.push("Photo is too blurry — hold the phone steady and retake.");
  }
  if (isLowLight) {
    warnings.push("Low light — hold steady and move closer if possible");
  }

  return {
    passed: !blur.isBlurry,
    isBlurry: blur.isBlurry,
    isPortrait,
    isLowLight,
    messages,
    warnings,
  };
}

export type PhotoQualityIssue = "blur" | "glare";

/** Document and odometer shots have to be readable. Other slots skip the check. */
export function needsSharpPhoto(angle: PhotoAngle): boolean {
  return angle === "odometer_fuel" || angle === "registration" || angle === "insurance";
}

/**
 * Glare is a large washed-out area. Blur is a low Laplacian variance.
 * A sharp, normally lit photo returns null.
 */
export function photoQualityIssue(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): PhotoQualityIssue | null {
  if (width < 3 || height < 3 || pixels.length < width * height * 4) return "blur";
  const gray = new Float64Array(width * height);
  let bright = 0;
  const count = width * height;
  for (let i = 0; i < count; i += 1) {
    const offset = i * 4;
    const value =
      0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
    gray[i] = value;
    if (value >= 245) bright += 1;
  }
  if (bright / count >= 0.12) return "glare";

  let sum = 0;
  let sumSq = 0;
  let samples = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const lap =
        gray[index - width] +
        gray[index - 1] +
        gray[index + 1] +
        gray[index + width] -
        4 * gray[index];
      sum += lap;
      sumSq += lap * lap;
      samples += 1;
    }
  }
  if (samples === 0) return "blur";
  const mean = sum / samples;
  const variance = sumSq / samples - mean * mean;
  if (variance < 80) return "blur";
  return null;
}

export function photoQualityMessage(issue: PhotoQualityIssue): string {
  if (issue === "glare") {
    return "This looks washed out by glare. Retake it, or use it and add a note.";
  }
  return "This looks blurry. Retake it, or use it and add a note.";
}
