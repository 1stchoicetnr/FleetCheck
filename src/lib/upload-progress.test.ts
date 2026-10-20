import assert from "node:assert/strict";
import test from "node:test";
import { uploadProgress } from "./upload-progress.ts";

test("upload percent and remaining time follow completed photos", () => {
  const started = 1_000;
  const midway = uploadProgress(2, 4, started, started + 10_000);
  assert.equal(midway.percent, 50);
  assert.equal(midway.estimate, "About 10s left");
  assert.equal(uploadProgress(0, 4, started, started).estimate, "Starting upload");
  assert.equal(uploadProgress(4, 4, started, started + 1000).percent, 100);
});
