import assert from "node:assert/strict";
import test from "node:test";
import {
  clientPhotoSrc,
  photoViewKind,
  priorReportForClient,
  storedPhotoFetchTarget,
  toClientReport,
} from "./photo-url.ts";
import type { CheckoutReport } from "./types.ts";

const BLOB = "https://abc.public.blob.vercel-storage.com/orgs/o/checks/r/front-xyz.jpg";

test("client reports hide the stored blob address", () => {
  const shown = toClientReport({
    id: "report 1",
    photos: [{ angle: "front", dataUrl: BLOB, capturedAt: "2026-10-27T00:00:00.000Z" }],
  });
  assert.equal(shown.photos[0]?.dataUrl, "/api/checkout-reports/report%201/photos/front");
  assert.equal(shown.photos[0]?.dataUrl.includes("blob.vercel-storage.com"), false);
  assert.equal(clientPhotoSrc("r", "rear", ""), "");
  assert.equal(clientPhotoSrc("r", "rear", "/photo-examples/rear.jpg"), "/photo-examples/rear.jpg");
});

test("photo view is the submitter, office roles, or the next driver", () => {
  assert.equal(photoViewKind(null, null, "Sam"), "deny");
  assert.equal(photoViewKind("driver", "Sam", "Sam"), "submitter");
  assert.equal(photoViewKind("driver", "sam", " Sam "), "submitter");
  assert.equal(photoViewKind("driver", "Alex", "Sam"), "next-driver");
  assert.equal(photoViewKind("office", "Pat", "Sam"), "office");
  assert.equal(photoViewKind("manager", "Pat", "Sam"), "office");
  assert.equal(photoViewKind("owner", "Pat", "Sam"), "office");
});

test("the photo proxy only fetches stored blob files and local examples", () => {
  const base = "https://fleet.example.test/api/checkout-reports/r/photos/front";
  assert.equal(storedPhotoFetchTarget(BLOB, base), BLOB);
  assert.equal(
    storedPhotoFetchTarget("/photo-examples/front.jpg", base),
    "https://fleet.example.test/photo-examples/front.jpg"
  );
  assert.equal(storedPhotoFetchTarget("https://169.254.169.254/latest", base), null);
  assert.equal(storedPhotoFetchTarget("http://abc.public.blob.vercel-storage.com/a.jpg", base), null);
  assert.equal(storedPhotoFetchTarget("/photo-examples/../.env", base), null);
});

test("prior checks sent to the browser drop the signature", () => {
  const report = {
    id: "r1",
    signatureDataUrl: "data:image/png;base64,abc",
    photos: [{ angle: "front", dataUrl: BLOB, capturedAt: "2026-10-27T00:00:00.000Z" }],
  } as CheckoutReport;
  const prior = priorReportForClient(report);
  assert.equal(prior.signatureDataUrl, undefined);
  assert.match(prior.photos[0]?.dataUrl || "", /^\/api\/checkout-reports\//);
});
