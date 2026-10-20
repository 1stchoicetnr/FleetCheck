import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";
import {
  FeedbackPayload,
  FeedbackPhotoStep,
  StoredFeedback,
  isFeedbackType,
  parseImageDataUrl,
} from "@/lib/feedback";
import { generateId } from "@/lib/utils";
import {
  getDatabaseUrl,
  hasBlobToken,
  isLocalSharedStoreEnabled,
  sharedBackendMode,
} from "./shared-config";
import { SharedBackendError } from "./checkout-repo";
import {
  localInsertFeedback,
  localListFeedback,
  localSetFeedbackDelivery,
} from "./local-store";

const DATA_DIR = path.join(process.cwd(), ".data", "blobs");

function sqlClient() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

let tableReady = false;

async function ensureFeedbackTable(): Promise<void> {
  if (tableReady) return;
  const sql = sqlClient();
  await sql`
    CREATE TABLE IF NOT EXISTS app_feedback (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      note TEXT,
      unit_id TEXT,
      unit_number TEXT,
      plate TEXT,
      page_phase TEXT,
      photo_step JSONB,
      page_url TEXT,
      user_agent TEXT,
      user_name TEXT,
      user_role TEXT,
      driver_name TEXT,
      screenshot_url TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      delivered_via TEXT NOT NULL
    )
  `;
  tableReady = true;
}

export async function storeFeedbackScreenshot(
  id: string,
  dataUrl: string | undefined
): Promise<string | undefined> {
  if (!dataUrl) return undefined;
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return undefined;
  const buffer = Buffer.from(parsed.base64, "base64");
  const filename = `feedback/${id}/${parsed.filename}`;
  if (hasBlobToken()) {
    try {
      const blob = await put(filename, buffer, {
        access: "public",
        contentType: parsed.mime,
        addRandomSuffix: true,
      });
      return blob.url;
    } catch (err) {
      console.error("[feedback] screenshot upload failed:", err);
      return dataUrl;
    }
  }
  if (isLocalSharedStoreEnabled()) {
    const filePath = path.join(DATA_DIR, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return `/api/shared-files/${filename}`;
  }
  return dataUrl;
}

function rowToFeedback(row: Record<string, unknown>): StoredFeedback {
  const step = row.photo_step as FeedbackPhotoStep | null | undefined;
  return {
    id: String(row.id),
    type: isFeedbackType(row.type) ? row.type : "Bug",
    note: row.note ? String(row.note) : undefined,
    unitId: row.unit_id ? String(row.unit_id) : undefined,
    unitNumber: row.unit_number ? String(row.unit_number) : undefined,
    plate: row.plate ? String(row.plate) : undefined,
    pagePhase: row.page_phase ? String(row.page_phase) : undefined,
    photoStep: step && typeof step === "object" ? step : undefined,
    pageUrl: row.page_url ? String(row.page_url) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    userName: row.user_name ? String(row.user_name) : undefined,
    userRole: row.user_role ? String(row.user_role) : undefined,
    driverName: row.driver_name ? String(row.driver_name) : undefined,
    screenshotUrl: row.screenshot_url ? String(row.screenshot_url) : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    deliveredVia:
      row.delivered_via === "slack" || row.delivered_via === "email"
        ? row.delivered_via
        : "office",
  };
}

export async function saveFeedback(
  payload: FeedbackPayload,
  screenshotUrl: string | undefined,
  deliveredVia: StoredFeedback["deliveredVia"],
  id = generateId()
): Promise<StoredFeedback> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") {
    throw new SharedBackendError(
      "Feedback could not be saved. The shared server is not configured.",
      503
    );
  }
  const entry: StoredFeedback = {
    id,
    type: payload.type,
    note: payload.note,
    unitId: payload.unitId,
    unitNumber: payload.unitNumber,
    plate: payload.plate,
    pagePhase: payload.pagePhase,
    photoStep: payload.photoStep,
    pageUrl: payload.pageUrl,
    userAgent: payload.userAgent,
    userName: payload.userName,
    userRole: payload.userRole,
    driverName: payload.driverName,
    screenshotUrl,
    createdAt: payload.timestamp || new Date().toISOString(),
    deliveredVia,
  };
  if (mode === "local-dev") return localInsertFeedback(entry);
  await ensureFeedbackTable();
  const sql = sqlClient();
  await sql`
    INSERT INTO app_feedback (
      id, type, note, unit_id, unit_number, plate, page_phase, photo_step,
      page_url, user_agent, user_name, user_role, driver_name, screenshot_url,
      created_at, delivered_via
    ) VALUES (
      ${entry.id},
      ${entry.type},
      ${entry.note ?? null},
      ${entry.unitId ?? null},
      ${entry.unitNumber ?? null},
      ${entry.plate ?? null},
      ${entry.pagePhase ?? null},
      CAST(${entry.photoStep ? JSON.stringify(entry.photoStep) : null} AS jsonb),
      ${entry.pageUrl ?? null},
      ${entry.userAgent ?? null},
      ${entry.userName ?? null},
      ${entry.userRole ?? null},
      ${entry.driverName ?? null},
      ${entry.screenshotUrl ?? null},
      ${entry.createdAt},
      ${entry.deliveredVia}
    )
  `;
  return entry;
}

export async function listFeedback(): Promise<StoredFeedback[]> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return [];
  if (mode === "local-dev") return localListFeedback();
  await ensureFeedbackTable();
  const sql = sqlClient();
  const rows = await sql`
    SELECT * FROM app_feedback
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return rows.map((row) => rowToFeedback(row));
}

export async function markFeedbackDelivered(
  id: string,
  deliveredVia: StoredFeedback["deliveredVia"]
): Promise<void> {
  const mode = sharedBackendMode();
  if (mode === "local-dev") {
    await localSetFeedbackDelivery(id, deliveredVia);
    return;
  }
  if (mode !== "postgres") return;
  await ensureFeedbackTable();
  const sql = sqlClient();
  await sql`
    UPDATE app_feedback SET delivered_via = ${deliveredVia} WHERE id = ${id}
  `;
}
