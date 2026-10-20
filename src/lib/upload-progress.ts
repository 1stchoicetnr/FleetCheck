export function uploadProgress(
  done: number,
  total: number,
  startedAt: number,
  now = Date.now()
): { percent: number; estimate: string } {
  const percent = total <= 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  if (done <= 0) return { percent, estimate: "Starting upload" };
  if (done >= total) return { percent: 100, estimate: "Finishing up" };
  const remainingMs = ((now - startedAt) / done) * (total - done);
  const seconds = Math.max(1, Math.round(remainingMs / 1000));
  const estimate =
    seconds < 60 ? `About ${seconds}s left` : `About ${Math.ceil(seconds / 60)} min left`;
  return { percent, estimate };
}
