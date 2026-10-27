import { ASHLEY_SLACK_DM } from "./ashley-slack.ts";

const TZ = "America/Los_Angeles";

export type TallyCheck = {
  driverName: string;
  reviewStatus: string;
  companyId?: string | null;
  companyName?: string | null;
};

export type TallyWindow = {
  kind: "week" | "month";
  key: string;
  label: string;
  start: string;
  end: string;
};

type Ymd = { year: number; month: number; day: number; weekday: string };

export function isRadarCompany(
  companyId?: string | null,
  companyName?: string | null
): boolean {
  return /radar/i.test(companyId || "") || /radar/i.test(companyName || "");
}

function pacificParts(date: Date): Ymd {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
  };
}

function zoneOffsetMs(date: Date): number {
  const parts = pacificParts(date);
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const clock = Object.fromEntries(
    hourFmt.formatToParts(date).map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    Number(clock.hour) % 24,
    Number(clock.minute),
    Number(clock.second)
  );
  return asUtc - date.getTime();
}

/** Midnight at the start of a Pacific calendar day, as UTC. */
export function pacificMidnight(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 8, 0, 0));
  return new Date(guess.getTime() - zoneOffsetMs(guess));
}

function shiftDays(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(pacificMidnight(year, month, 1));
}

/**
 * Monday morning sends the week that just ended.
 * The first morning of a month sends the month that just ended.
 * Any other day sends nothing.
 */
export function tallyWindows(now: Date): TallyWindow[] {
  const parts = pacificParts(now);
  const windows: TallyWindow[] = [];
  if (parts.weekday === "Mon") {
    const end = pacificMidnight(parts.year, parts.month, parts.day);
    const startDay = shiftDays(parts.year, parts.month, parts.day, -7);
    const start = pacificMidnight(startDay.year, startDay.month, startDay.day);
    windows.push({
      kind: "week",
      key: `week:${startDay.year}-${String(startDay.month).padStart(2, "0")}-${String(startDay.day).padStart(2, "0")}`,
      label: `Week of ${dateLabel(start)}`,
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }
  if (parts.day === 1) {
    const end = pacificMidnight(parts.year, parts.month, parts.day);
    const prev = parts.month === 1
      ? { year: parts.year - 1, month: 12 }
      : { year: parts.year, month: parts.month - 1 };
    const start = pacificMidnight(prev.year, prev.month, 1);
    windows.push({
      kind: "month",
      key: `month:${prev.year}-${String(prev.month).padStart(2, "0")}`,
      label: monthLabel(prev.year, prev.month),
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }
  return windows;
}

type Counts = {
  total: number;
  pass: number;
  conditional: number;
  fail: number;
  pending: number;
};

function emptyCounts(): Counts {
  return { total: 0, pass: 0, conditional: 0, fail: 0, pending: 0 };
}

export function driverTallyText(window: TallyWindow, checks: TallyCheck[]): string | null {
  const rows = checks.filter((check) => {
    if (window.kind === "week" && isRadarCompany(check.companyId, check.companyName)) {
      return false;
    }
    return true;
  });
  if (!rows.length) return null;
  const byDriver = new Map<string, Counts>();
  for (const check of rows) {
    const name = check.driverName.trim() || "Driver";
    const counts = byDriver.get(name) ?? emptyCounts();
    counts.total += 1;
    if (check.reviewStatus === "pass") counts.pass += 1;
    else if (check.reviewStatus === "conditional") counts.conditional += 1;
    else if (check.reviewStatus === "fail") counts.fail += 1;
    else counts.pending += 1;
    byDriver.set(name, counts);
  }
  const lines = [...byDriver.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, counts]) => {
      const pending = counts.pending ? ` · ${counts.pending} not reviewed` : "";
      const noun = counts.total === 1 ? "check" : "checks";
      return `${name} — ${counts.total} ${noun} · ${counts.pass} pass · ${counts.conditional} conditional · ${counts.fail} fail${pending}`;
    });
  return [`*Inspekt driver tally · ${window.label}*`, ...lines].join("\n");
}

export function repeatProblemNote(message: string, driverName: string): string {
  const who = driverName.trim() || "Driver";
  return `*Repeat problem*\n${message}\n*Driver:* ${who}`;
}

export function tallyMentionsOnlyAshley(): boolean {
  return ASHLEY_SLACK_DM === "DHPKVTEBD";
}
