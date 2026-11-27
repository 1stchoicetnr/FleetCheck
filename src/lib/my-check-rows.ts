import { previousDayOutboxMessage } from "./checkout-draft-day";
import { reconcileOutboxWithServer, type ServerCheckStatus } from "./checkout-reconcile";
import { isBeforeRolloutSlate } from "./rollout-slate";
import { formatUnitLabel } from "./utils";

export interface MyCheckOutbox {
  id: string;
  serverReportId?: string;
  unitNumber: string;
  plate?: string;
  year: number;
  make: string;
  model: string;
  createdAt: string;
  signedAt?: string;
  capturedAt?: string;
  photos?: Array<{ capturedAt?: string }>;
}

export interface MyCheckSource extends ServerCheckStatus {
  unitNumber?: string;
  plate?: string;
  year?: number;
  make?: string;
  model?: string;
  createdAt: string;
  archivedAt?: string;
}

export interface MyCheckRow {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  sentAt?: string;
  localOnly?: boolean;
  unfinished?: boolean;
  archivedAt?: string;
  /** Shown when this phone still has yesterday's check. */
  note?: string;
}

/**
 * Outbox rows whose server report is already sent are left out, so the server
 * row shows as Sent. A check still waiting on this phone stays unfinished.
 */
export function buildMyCheckRows(input: {
  outbox: MyCheckOutbox[];
  local: MyCheckSource[];
  remote: MyCheckSource[];
  now?: Date;
}): MyCheckRow[] {
  const now = input.now ?? new Date();
  const { keep } = reconcileOutboxWithServer(input.outbox, input.remote);
  const byId = new Map<string, MyCheckRow>();
  const waitingIds = new Set<string>();
  for (const item of keep) {
    waitingIds.add(item.id);
    if (item.serverReportId) waitingIds.add(item.serverReportId);
    byId.set(item.serverReportId || item.id, {
      id: item.serverReportId || item.id,
      title: formatUnitLabel(item.unitNumber, item.plate),
      detail: `${item.year} ${item.make} ${item.model}`,
      createdAt: item.createdAt,
      localOnly: !item.serverReportId,
      unfinished: true,
      note: previousDayOutboxMessage(item, now) ?? undefined,
    });
  }
  for (const report of input.local) {
    if (byId.has(report.id)) continue;
    byId.set(report.id, rowFromReport(report));
  }
  for (const report of input.remote) {
    if (waitingIds.has(report.id)) continue;
    byId.set(report.id, rowFromReport(report));
  }
  const remoteIds = new Set(input.remote.map((report) => report.id));
  return Array.from(byId.values())
    .filter((row) => {
      if (row.archivedAt) return false;
      if (remoteIds.has(row.id)) return true;
      return !isBeforeRolloutSlate(row.createdAt);
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function rowFromReport(report: MyCheckSource): MyCheckRow {
  return {
    id: report.id,
    title: formatUnitLabel(report.unitNumber, report.plate),
    detail: `${report.year ?? ""} ${report.make ?? ""} ${report.model ?? ""}`.trim(),
    createdAt: report.createdAt,
    sentAt: report.sentAt || undefined,
    archivedAt: report.archivedAt,
  };
}
