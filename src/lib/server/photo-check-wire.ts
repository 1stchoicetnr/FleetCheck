import { after } from "next/server";
import { cleanPhotoCheckSettings, pacificMonthStart, type PhotoCheckResult } from "@/lib/photo-check";
import type { CheckoutReport, PhotoAngle } from "@/lib/types";
import { blobAccessKind, readStoredPhotoBytes } from "./photo-store";
import { gatewayToken, runPhotoCheck } from "./photo-check-run";
import { sharedBackendMode } from "./shared-config";
import type { SharedOfficeAlert } from "./shared-types";

/** This month's photo check spend for the org (sums results saved on photos). */
export async function photoCheckSpend(orgId: string): Promise<{ spend: number; calls: number }> {
  const since = pacificMonthStart();
  if (sharedBackendMode() === "postgres") {
    const { pgDb } = await import("./postgres-store");
    const { sumPhotoCheckSpend } = await import("./org-data");
    return sumPhotoCheckSpend(pgDb(), orgId, since);
  }
  const { localListReports } = await import("./local-store");
  let spend = 0;
  let calls = 0;
  for (const r of await localListReports()) {
    for (const p of r.photos) {
      if (p.photoCheck && p.photoCheck.at >= since) {
        spend += p.photoCheck.costUsd || 0;
        calls += 1;
      }
    }
  }
  return { spend, calls };
}

async function storedToDataUrl(stored: string): Promise<string> {
  if (stored.startsWith("data:")) return stored;
  if (!blobAccessKind(stored)) throw new Error("not a stored photo");
  const loaded = await readStoredPhotoBytes(stored);
  return `data:${loaded.contentType || "image/jpeg"};base64,${Buffer.from(loaded.bytes).toString("base64")}`;
}

async function checkNow(orgId: string, reportId: string): Promise<void> {
  const repo = await import("./checkout-repo");
  const settings = cleanPhotoCheckSettings((await repo.getPublicCompanySettings(orgId)).photoCheck);
  if (!settings.enabled) return;
  // Fresh copy: slots that already have a result are skipped.
  const report = await repo.getReport(orgId, reportId);
  if (!report) return;
  const history = await repo.listVehicleReports(orgId, report.vehicleId).catch(() => [] as CheckoutReport[]);
  const { listKnownDamage } = await import("./known-damage-repo");
  const { pgInsertAlert } = await import("./postgres-store");
  const { localInsertAlert } = await import("./local-store");
  const result = await runPhotoCheck(orgId, report, history, {
    settings: async () => settings,
    spentThisMonth: async () => (await photoCheckSpend(orgId)).spend,
    knownDamage: () => listKnownDamage(orgId, report.vehicleId).catch(() => []),
    imageDataUrl: storedToDataUrl,
    token: gatewayToken,
    fetch: (url, init) => fetch(url, init),
    save: async (results: Partial<Record<PhotoAngle, PhotoCheckResult>>) => {
      await repo.setPhotoChecks(orgId, reportId, (p) =>
        results[p.angle] && !p.photoCheck ? { ...p, photoCheck: results[p.angle] } : p
      );
    },
    insertAlert: async (alert: SharedOfficeAlert) => {
      if (sharedBackendMode() === "postgres") await pgInsertAlert(orgId, alert);
      else await localInsertAlert(alert);
    },
  });
  console.info(
    `[photo-check] report=${reportId} ran=${result.ran} found=${result.found.join(",") || "none"}${result.skipped ? ` skipped=${result.skipped}` : ""}`
  );
}

/** Start the photo check after the response (Vercel `after`), or inline outside a request. Never throws. */
export function schedulePhotoCheck(orgId: string, reportId: string): void {
  const job = () => checkNow(orgId, reportId).catch((err) => console.error("[photo-check] failed", err));
  try {
    after(job);
  } catch {
    void job();
  }
}
