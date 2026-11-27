/**
 * A check can finish on the server while this phone still has the outbox row
 * (the success response never arrived). That row must leave the phone.
 * Deleting it does not create a report. A retry of one that is not sent yet
 * still uses the same idempotency key.
 */

export interface ServerCheckStatus {
  id: string;
  sentAt?: string | null;
}

export function reconcileOutboxWithServer<T extends { id: string; serverReportId?: string }>(
  items: T[],
  serverReports: ServerCheckStatus[]
): { keep: T[]; remove: T[] } {
  const sent = new Set(
    serverReports.filter((report) => Boolean(report.sentAt)).map((report) => report.id)
  );
  const remove = items.filter(
    (item) => Boolean(item.serverReportId && sent.has(item.serverReportId))
  );
  const removeIds = new Set(remove.map((item) => item.id));
  return {
    keep: items.filter((item) => !removeIds.has(item.id)),
    remove,
  };
}

/**
 * Reports this phone can trust. My-checks is the list. A queued check missing
 * from that list gets one status read. If the list itself fails, nothing is
 * treated as sent.
 */
export async function loadServerReportsForOutbox<T extends ServerCheckStatus>(
  items: Array<{ serverReportId?: string }>,
  loadMine: () => Promise<T[]>,
  loadOne: (id: string) => Promise<T | null>
): Promise<T[]> {
  let mine: T[];
  try {
    mine = await loadMine();
  } catch {
    return [];
  }
  const byId = new Map(mine.map((report) => [report.id, report]));
  for (const item of items) {
    const id = item.serverReportId;
    if (!id || byId.has(id)) continue;
    try {
      const report = await loadOne(id);
      if (report) byId.set(report.id, report);
    } catch {
      // Not confirmed. Leave the outbox row alone.
    }
  }
  return [...byId.values()];
}

/** Delete each outbox row whose server report is already sent, and its draft. */
export async function removeSentOutboxItems<
  T extends { id: string; draftId?: string; serverReportId?: string },
>(
  items: T[],
  serverReports: ServerCheckStatus[],
  storage: {
    deleteOutbox: (id: string) => Promise<void>;
    deleteDraft: (id: string) => Promise<void>;
    beforeDelete?: (item: T) => Promise<void>;
  }
): Promise<T[]> {
  const { remove } = reconcileOutboxWithServer(items, serverReports);
  for (const item of remove) {
    if (storage.beforeDelete) await storage.beforeDelete(item);
    await storage.deleteOutbox(item.id);
    if (item.draftId) await storage.deleteDraft(item.draftId);
  }
  return remove;
}
