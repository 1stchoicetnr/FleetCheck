import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Vehicle } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMileage(miles: number): string {
  return miles.toLocaleString("en-US") + " mi";
}

export function normalizePlate(plate: string): string {
  return plate.replace(/[\s-]/g, "").toUpperCase();
}

export function formatUnitLabel(unitNumber?: string, plate?: string): string {
  const unit = unitNumber?.trim();
  const p = plate?.trim();
  if (
    unit &&
    p &&
    normalizePlate(unit) !== normalizePlate(p)
  ) {
    return `Unit ${unit} · ${p}`;
  }
  if (unit) return `Unit ${unit}`;
  if (p) return p;
  return "Unknown unit";
}

/** Year Make Model (Plate) — used in Slack alerts */
export function formatVehicleSlackLabel(vehicle: Vehicle): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.plate})`;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Longest edge and JPEG quality for checkout / check-in uploads. */
export const PHOTO_UPLOAD_MAX_EDGE = 1920;
export const PHOTO_UPLOAD_JPEG_QUALITY = 0.75;

export async function compressUploadPhoto(dataUrl: string): Promise<string> {
  return compressImage(
    dataUrl,
    PHOTO_UPLOAD_MAX_EDGE,
    PHOTO_UPLOAD_JPEG_QUALITY
  );
}

export async function compressImageFile(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return compressUploadPhoto(dataUrl);
}

export function getImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Scale image to fit inside maxW × maxH while preserving aspect ratio. */
export function fitInBox(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const ratio = srcW / srcH;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width, height };
}

export function compressImage(
  dataUrl: string,
  maxDimension = PHOTO_UPLOAD_MAX_EDGE,
  quality = PHOTO_UPLOAD_JPEG_QUALITY
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);
      if (longest > maxDimension) {
        const scale = maxDimension / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
