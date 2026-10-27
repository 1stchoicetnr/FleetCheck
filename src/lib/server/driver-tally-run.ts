import { postAshleySlackDm } from "@/lib/ashley-slack";
import type { CheckoutFetch } from "@/lib/checkout-slack";
import { driverTallyText, tallyWindows, type TallyCheck } from "@/lib/driver-tally";
import {
  listDriverTallyChecks,
  markDriverTallySent,
  readDriverTallySent,
  type OrgDb,
} from "@/lib/server/org-data";

export async function runDriverTallies(input: {
  db: OrgDb;
  orgId: string;
  now?: Date;
  token?: string | null;
  webhookUrl?: string | null;
  fetchImpl?: CheckoutFetch;
}): Promise<{ sent: number }> {
  const windows = tallyWindows(input.now ?? new Date());
  if (!windows.length) return { sent: 0 };
  const already = new Set(await readDriverTallySent(input.db, input.orgId));
  let sent = 0;
  for (const window of windows) {
    if (already.has(window.key)) continue;
    const rows = await listDriverTallyChecks(
      input.db,
      input.orgId,
      window.start,
      window.end
    );
    const checks: TallyCheck[] = rows.map((row) => ({
      driverName: String(row.driver_name ?? ""),
      reviewStatus: String(row.review_status ?? ""),
      companyId: row.company_id == null ? null : String(row.company_id),
      companyName: row.company_name == null ? null : String(row.company_name),
    }));
    const text = driverTallyText(window, checks);
    if (!text) {
      await markDriverTallySent(input.db, input.orgId, window.key);
      continue;
    }
    const result = await postAshleySlackDm(text, {
      token: input.token,
      webhookUrl: input.webhookUrl,
      fetchImpl: input.fetchImpl,
    });
    if (result === "skipped") continue;
    await markDriverTallySent(input.db, input.orgId, window.key);
    sent += 1;
  }
  return { sent };
}
