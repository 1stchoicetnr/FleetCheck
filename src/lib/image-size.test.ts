import assert from "node:assert/strict";
import test from "node:test";
import { imageSizeFromDataUrl } from "./image-size.ts";

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
