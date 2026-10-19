/** A report that can be ordered against others for the same unit. */
export interface PriorCandidate {
  id: string;
  completedAt: string;
}

/**
 * Reports completed strictly before `current`, newest first.
 * A later check-in is not a prior of an earlier checkout.
 */
export function earlierReports<T extends PriorCandidate>(
  reports: T[],
  current: PriorCandidate,
  limit = 2
): T[] {
  const currentTime = Date.parse(current.completedAt);
  if (!Number.isFinite(currentTime)) return [];
  return reports
    .filter((report) => {
      if (report.id === current.id) return false;
      const time = Date.parse(report.completedAt);
      return Number.isFinite(time) && time < currentTime;
    })
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, limit);
}
