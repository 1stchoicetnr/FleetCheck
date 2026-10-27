import {
  DAMAGE_SIDES,
  INSPECTION_CHECK_ITEMS,
  ISSUE_FLAG_ITEMS,
  TREAD_TIRE_ITEMS,
  asTreadByTire,
  type CheckoutInspectionForm,
} from "./inspection-form";
import { photoAngleLabel } from "./photo-flags";
import type { PhotoAngle } from "./types";

export type RepeatIssue = {
  key: string;
  label: string;
};

type Snapshot = {
  inspectionForm?: CheckoutInspectionForm | null;
  photos?: ReadonlyArray<{ angle: PhotoAngle; flaggedDamage?: boolean }>;
};

export function issuesOnCheck(report: Snapshot): RepeatIssue[] {
  const form = report.inspectionForm;
  const issues: RepeatIssue[] = [];
  if (form) {
    for (const item of INSPECTION_CHECK_ITEMS) {
      if (form.checks[item.id]?.result === "not_ok") {
        issues.push({ key: `check:${item.id}`, label: item.label });
      }
    }
    for (const item of ISSUE_FLAG_ITEMS) {
      if (form.issueFlags?.[item.id]) {
        issues.push({ key: `flag:${item.id}`, label: item.label });
      }
    }
    const tread = asTreadByTire(form.treadByTire, form.treadLevel);
    for (const tire of TREAD_TIRE_ITEMS) {
      const level = tread[tire.id];
      if (level === "low" || level === "bald") {
        issues.push({ key: `tread:${tire.id}`, label: `${tire.label} tread` });
      }
    }
    for (const side of DAMAGE_SIDES) {
      const note = form.damage?.[side.id];
      if (typeof note === "string" && note.trim()) {
        issues.push({ key: `damage:${side.id}`, label: `${side.label} damage` });
      }
    }
  }
  for (const photo of report.photos || []) {
    if (!photo.flaggedDamage) continue;
    issues.push({
      key: `photo:${photo.angle}`,
      label: `${photoAngleLabel(photo.angle)} photo`,
    });
  }
  return issues;
}

/** Issues on this check that already appeared on an earlier check of the same unit. */
export function repeatedIssues(current: Snapshot, priors: Snapshot[]): Array<RepeatIssue & { count: number }> {
  const mine = issuesOnCheck(current);
  const counts = new Map<string, number>();
  for (const issue of mine) counts.set(issue.key, 1);
  for (const prior of priors) {
    const seen = new Set<string>();
    for (const issue of issuesOnCheck(prior)) {
      if (!counts.has(issue.key) || seen.has(issue.key)) continue;
      seen.add(issue.key);
      counts.set(issue.key, (counts.get(issue.key) || 0) + 1);
    }
  }
  return mine
    .filter((issue) => (counts.get(issue.key) || 0) >= 2)
    .map((issue) => ({ ...issue, count: counts.get(issue.key) || 2 }));
}
