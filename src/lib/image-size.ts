export type ImageSize = { width: number; height: number };

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
