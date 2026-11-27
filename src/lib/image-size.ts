export type ImageSize = { width: number; height: number };
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

function dataUrlBytes(dataUrl: string): { kind: string; bytes: Buffer } | null {
  const match = /^data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) return null;
  return { kind: match[1].toLowerCase(), bytes: Buffer.from(match[2], "base64") };
}

function pngSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc2) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

export function imageSizeFromDataUrl(dataUrl: string): ImageSize | null {
  const parsed = dataUrlBytes(dataUrl);
  if (!parsed) return null;
  if (parsed.kind === "png") return pngSize(parsed.bytes);
  if (parsed.kind === "jpeg" || parsed.kind === "jpg") return jpegSize(parsed.bytes);
  return null;
}

function read16(bytes: Buffer, at: number, little: boolean): number {
  return little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at);
}

function read32(bytes: Buffer, at: number, little: boolean): number {
  return little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
}

function orientationInExif(segment: Buffer): ExifOrientation | null {
  if (segment.length < 16 || segment.toString("ascii", 0, 4) !== "Exif") return null;
  const tiff = 6;
  if (segment.length < tiff + 8) return null;
  const order = segment.toString("ascii", tiff, tiff + 2);
  const little = order === "II";
  if (!little && order !== "MM") return null;
  if (read16(segment, tiff + 2, little) !== 42) return null;
  const ifdStart = tiff + read32(segment, tiff + 4, little);
  if (ifdStart + 2 > segment.length) return null;
  const count = read16(segment, ifdStart, little);
  for (let i = 0; i < count; i += 1) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > segment.length) return null;
    if (read16(segment, entry, little) !== 0x0112) continue;
    const type = read16(segment, entry + 2, little);
    const n = read32(segment, entry + 4, little);
    if (type !== 3 || n < 1) return null;
    const value = read16(segment, entry + 8, little);
    if (value >= 1 && value <= 8) return value as ExifOrientation;
    return null;
  }
  return null;
}

/** Orientation tag from a JPEG, or null when the file does not say. */
export function jpegOrientation(bytes: Buffer): ExifOrientation | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (marker === 0xe1) {
      const found = orientationInExif(bytes.subarray(offset + 4, offset + 2 + length));
      if (found) return found;
    }
    if (marker >= 0xc0 && marker <= 0xc2) return null;
    offset += 2 + length;
  }
  return null;
}

export function jpegOrientationFromDataUrl(dataUrl: string): ExifOrientation | null {
  const parsed = dataUrlBytes(dataUrl);
  if (!parsed || (parsed.kind !== "jpeg" && parsed.kind !== "jpg")) return null;
  return jpegOrientation(parsed.bytes);
}

/** A phone JPEG whose pixels are stored sideways. The canvas bake turns it upright. */
export function jpegNeedsOrientationBake(dataUrl: string): boolean {
  const orientation = jpegOrientationFromDataUrl(dataUrl);
  return orientation != null && orientation !== 1;
}
