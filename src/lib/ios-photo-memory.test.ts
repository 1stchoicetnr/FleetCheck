import test from "node:test";
import assert from "node:assert/strict";
import {
  isSendablePhoto,
  isUsableImageDataUrl,
  MAX_QUEUED_PHOTO_CHARS,
  releaseCanvas,
  withFallbackAfter,
} from "./canvas-safe.ts";
import { isLostDbConnection, withDbRetry } from "./idb-retry.ts";

const realJpeg = `data:image/jpeg;base64,${"A".repeat(5000)}`;

test("an empty canvas result is not a usable photo", () => {
  assert.equal(isUsableImageDataUrl("data:,"), false);
  assert.equal(isUsableImageDataUrl("data:image/jpeg;base64,"), false);
  assert.equal(isUsableImageDataUrl(""), false);
  assert.equal(isUsableImageDataUrl(undefined), false);
  assert.equal(isUsableImageDataUrl(realJpeg), true);
  assert.equal(isUsableImageDataUrl(`data:image/png;base64,${"B".repeat(200)}`), true);
});

test("the outbox only sends photos the server will take", () => {
  assert.equal(isSendablePhoto("data:,"), false);
  assert.equal(isSendablePhoto(realJpeg), true);
  assert.equal(isSendablePhoto("https://x.private.blob.vercel-storage.com/a.jpg"), true);
  assert.equal(isSendablePhoto("/photo-examples/01-lf-corner.jpg"), true);
  assert.ok(MAX_QUEUED_PHOTO_CHARS < 4_500_000);
});

test("a canvas is shrunk to 1x1 when released", () => {
  let cleared = false;
  const canvas = {
    width: 4032,
    height: 3024,
    getContext: () => ({ clearRect: () => (cleared = true) }),
  };
  releaseCanvas(canvas);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.equal(cleared, true);
  releaseCanvas(null);
  releaseCanvas({ width: 10, height: 10, getContext: () => null });
});

test("work that never finishes falls back instead of hanging", async () => {
  const never = new Promise<string>(() => {});
  assert.equal(await withFallbackAfter(never, 20, "original"), "original");
  assert.equal(await withFallbackAfter(Promise.resolve("small"), 1000, "original"), "small");
  assert.equal(await withFallbackAfter(Promise.reject(new Error("x")), 1000, "original"), "original");
});

/** Minimal browser stand-ins: an image that loads and a canvas whose 2d context iOS refused. */
function fakeBrowser(context: "null" | "throws" | "empty") {
  const g = globalThis as Record<string, unknown>;
  const saved = { Image: g.Image, document: g.document };
  const released: number[] = [];
  class FakeImage {
    width = 4032;
    height = 3024;
    naturalWidth = 4032;
    naturalHeight = 3024;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  g.Image = FakeImage;
  g.document = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => {
          if (canvas.width === 1) return { clearRect: () => released.push(1) };
          if (context === "null") return null;
          if (context === "throws") throw new Error("canvas");
          return { drawImage: () => undefined, fillRect: () => undefined, fillText: () => undefined };
        },
        toDataURL: () => "data:,",
      };
      return canvas;
    },
  };
  return {
    released,
    restore() {
      g.Image = saved.Image;
      g.document = saved.document;
    },
  };
}

for (const mode of ["null", "throws", "empty"] as const) {
  test(`resizing keeps the original photo when the iPhone canvas is ${mode}`, async () => {
    const browser = fakeBrowser(mode);
    try {
      const { compressImage } = await import("./utils.ts");
      const big = `data:image/jpeg;base64,${"C".repeat(900_000)}`;
      const out = await withFallbackAfter(compressImage(big), 2000, "HUNG");
      assert.equal(out, big);
      assert.ok(browser.released.length >= 1, "canvas released");
    } finally {
      browser.restore();
    }
  });

  test(`the time stamp keeps the plain photo when the iPhone canvas is ${mode}`, async () => {
    const browser = fakeBrowser(mode);
    try {
      const { stampPhotoDataUrl } = await import("./photo-stamp.ts");
      const out = await withFallbackAfter(
        stampPhotoDataUrl(realJpeg, "2026-11-19T15:10:00.000Z"),
        2000,
        "HUNG"
      );
      assert.equal(out, realJpeg);
    } finally {
      browser.restore();
    }
  });
}

test("a lost iPhone database connection is recognized", () => {
  assert.equal(
    isLostDbConnection(new Error("Connection to Indexed Database server lost. Refresh the page to try again")),
    true
  );
  const closing = Object.assign(new Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing."), {
    name: "InvalidStateError",
  });
  assert.equal(isLostDbConnection(closing), true);
  assert.equal(isLostDbConnection(new Error("Key already exists")), false);
  assert.equal(isLostDbConnection(null), false);
});

test("a step on a dropped connection reopens once and succeeds", async () => {
  let opens = 0;
  let resets = 0;
  const value = await withDbRetry(
    async () => ++opens,
    () => {
      resets += 1;
    },
    async (db) => {
      if (db === 1) throw new Error("UnknownError: Connection to Indexed Database server lost.");
      return "saved";
    }
  );
  assert.equal(value, "saved");
  assert.equal(opens, 2);
  assert.equal(resets, 1);
});

test("other database errors are not retried", async () => {
  let opens = 0;
  await assert.rejects(
    withDbRetry(
      async () => ++opens,
      () => undefined,
      async () => {
        throw new Error("QuotaExceededError");
      }
    ),
    /Quota/
  );
  assert.equal(opens, 1);
});
