export interface SpeedSample {
  path: string;
  kind: "load" | "route";
  ms: number;
  at: number;
}

export const SPEED_STORAGE_KEY = "inspekt-speed";

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

export function pushSpeedSample(
  existing: SpeedSample[],
  sample: SpeedSample
): SpeedSample[] {
  return [...existing, sample].slice(-30);
}

export function summarizeSpeed(samples: SpeedSample[]): {
  loads: number;
  routes: number;
  loadMedianMs: number | null;
  routeMedianMs: number | null;
} {
  const loads = samples.filter((sample) => sample.kind === "load").map((sample) => sample.ms);
  const routes = samples
    .filter((sample) => sample.kind === "route")
    .map((sample) => sample.ms);
  return {
    loads: loads.length,
    routes: routes.length,
    loadMedianMs: median(loads),
    routeMedianMs: median(routes),
  };
}
