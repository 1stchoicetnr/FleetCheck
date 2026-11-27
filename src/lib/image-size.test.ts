import assert from "node:assert/strict";
import test from "node:test";
import { imageSizeFromDataUrl, jpegNeedsOrientationBake, jpegOrientation } from "./image-size.ts";

function exifJpeg(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const app1 = Buffer.alloc(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x0a, 0x00, 0x14, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof]);
}

test("png and jpeg data urls report their pixel size", () => {
  const png = Buffer.alloc(24);
  png.write("\x89PNG\r\n\x1a\n", 0, "binary");
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(32, 16);
  png.writeUInt32BE(16, 20);
  const jpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x0a,
    0x00, 0x14,
    0x00,
  ]);
  assert.deepEqual(
    imageSizeFromDataUrl(`data:image/png;base64,${png.toString("base64")}`),
    { width: 32, height: 16 }
  );
  assert.deepEqual(
    imageSizeFromDataUrl(`data:image/jpeg;base64,${jpeg.toString("base64")}`),
    { width: 20, height: 10 }
  );
});

test("a sideways phone JPEG is detected, and an upright one is not baked again", () => {
  const sideways = exifJpeg(6);
  const upright = exifJpeg(1);
  assert.equal(jpegOrientation(sideways), 6);
  assert.equal(jpegOrientation(upright), 1);
  assert.equal(jpegOrientation(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null);
  const sideUrl = `data:image/jpeg;base64,${sideways.toString("base64")}`;
  const upUrl = `data:image/jpeg;base64,${upright.toString("base64")}`;
  assert.equal(jpegNeedsOrientationBake(sideUrl), true);
  assert.equal(jpegNeedsOrientationBake(upUrl), false);
  assert.deepEqual(imageSizeFromDataUrl(sideUrl), { width: 20, height: 10 });
});
