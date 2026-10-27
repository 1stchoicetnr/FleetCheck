import assert from "node:assert/strict";
import test from "node:test";
import { blobAccessKind, readStoredPhotoBytes } from "./server/photo-store.ts";

const PUBLIC = "https://abc.public.blob.vercel-storage.com/orgs/o/checks/r/front.jpg";
const PRIVATE = "https://abc.private.blob.vercel-storage.com/orgs/o/checks/r/front-private.jpg";

test("blob hosts are public or private", () => {
  assert.equal(blobAccessKind(PUBLIC), "public");
  assert.equal(blobAccessKind(PRIVATE), "private");
  assert.equal(blobAccessKind("https://example.com/photo.jpg"), null);
  assert.equal(blobAccessKind("/photo-examples/front.jpg"), null);
});

test("a private photo is read with the store token", async () => {
  const calls: string[] = [];
  const loaded = await readStoredPhotoBytes(PRIVATE, {
    fetchPublic: async (url) => {
      calls.push(`public:${url}`);
      throw new Error("public");
    },
    readPrivate: async (url) => {
      calls.push(`private:${url}`);
      return { bytes: Uint8Array.from([1, 2, 3]), contentType: "image/jpeg" };
    },
  });
  assert.deepEqual(Array.from(loaded.bytes), [1, 2, 3]);
  assert.deepEqual(calls, [`private:${PRIVATE}`]);
});

test("a public photo stays on the open URL, and a closed one can fall back", async () => {
  const open = await readStoredPhotoBytes(PUBLIC, {
    fetchPublic: async () => ({ bytes: Uint8Array.from([9]), contentType: "image/jpeg" }),
    readPrivate: async () => {
      throw new Error("should not read private");
    },
  });
  assert.deepEqual(Array.from(open.bytes), [9]);

  const closed = await readStoredPhotoBytes(PUBLIC, {
    fetchPublic: async () => {
      throw new Error("gone");
    },
    readPrivate: async () => ({ bytes: Uint8Array.from([7]), contentType: "image/jpeg" }),
  });
  assert.deepEqual(Array.from(closed.bytes), [7]);
});
