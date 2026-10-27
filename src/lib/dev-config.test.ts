import assert from "node:assert/strict";
import test from "node:test";
import { canSkipPhotosForTesting, shouldAutoSkipPhotos } from "./dev-config.ts";

test("the photo skip flag is ignored outside local development", () => {
  const nodeEnv = process.env.NODE_ENV;
  const flag = process.env.NEXT_PUBLIC_SKIP_PHOTOS;
  process.env.NODE_ENV = "production";
  process.env.NEXT_PUBLIC_SKIP_PHOTOS = "true";
  assert.equal(canSkipPhotosForTesting(), false);
  assert.equal(shouldAutoSkipPhotos(), false);
  process.env.NODE_ENV = "development";
  assert.equal(canSkipPhotosForTesting(), true);
  assert.equal(shouldAutoSkipPhotos(), true);
  process.env.NEXT_PUBLIC_SKIP_PHOTOS = "false";
  assert.equal(canSkipPhotosForTesting(), true);
  assert.equal(shouldAutoSkipPhotos(), false);
  process.env.NODE_ENV = nodeEnv;
  if (flag === undefined) delete process.env.NEXT_PUBLIC_SKIP_PHOTOS;
  else process.env.NEXT_PUBLIC_SKIP_PHOTOS = flag;
});
