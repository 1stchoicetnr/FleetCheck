import { detectBlur } from "./blur-detection";
import { getImageDimensions } from "./utils";
import type { PhotoStep } from "./types";

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
  category: PhotoStep["category"]
): Promise<PhotoQualityResult> {
  const [blur, dims, isLowLight] = await Promise.all([
    detectBlur(dataUrl),
    getImageDimensions(dataUrl),
    detectLowLight(dataUrl),
  ]);

  const isPortrait = dims.width < dims.height;
  const needsLandscape = category === "exterior";
  const messages: string[] = [];
  const warnings: string[] = [];

  if (blur.isBlurry) {
    messages.push("Photo is too blurry — hold the phone steady and retake.");
  }
  if (needsLandscape && isPortrait) {
    messages.push(
      "Photo must be landscape — rotate your phone sideways and retake."
    );
  }
  if (isLowLight) {
    warnings.push("Low light — hold steady and move closer if possible");
  }

  return {
    passed: !blur.isBlurry && !(needsLandscape && isPortrait),
    isBlurry: blur.isBlurry,
    isPortrait: needsLandscape && isPortrait,
    isLowLight,
    messages,
    warnings,
  };
}
