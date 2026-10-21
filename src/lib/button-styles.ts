/**
 * Button colors for the charcoal theme.
 * gray-900 is remapped to #f7f7f8, so bg-gray-900 text-white is white on white.
 * Disabled states use their own colors. Opacity would drop them under WCAG AA.
 */
export const buttonContrastPairs = [
  { name: "primary", fg: "#052e16", bg: "#22c55e" },
  { name: "primary-hover", fg: "#052e16", bg: "#4ade80" },
  { name: "primary-active", fg: "#052e16", bg: "#16a34a" },
  { name: "primary-disabled", fg: "#ecfdf5", bg: "#14532d" },
  { name: "secondary", fg: "#f7f7f8", bg: "#2a2a2e" },
  { name: "secondary-hover", fg: "#f7f7f8", bg: "#3a3a40" },
  { name: "secondary-disabled", fg: "#d4d4d8", bg: "#1c1c1e" },
  { name: "secondary-outline", fg: "#f7f7f8", bg: "#1c1c1e" },
  { name: "danger", fg: "#ffffff", bg: "#b91c1c" },
  { name: "danger-hover", fg: "#ffffff", bg: "#991b1b" },
  { name: "danger-active", fg: "#ffffff", bg: "#7f1d1d" },
  { name: "danger-disabled", fg: "#fee2e2", bg: "#7f1d1d" },
  { name: "danger-outline", fg: "#fca5a5", bg: "#1c1c1e" },
  { name: "danger-outline-hover", fg: "#fee2e2", bg: "#7f1d1d" },
  { name: "danger-outline-disabled", fg: "#fca5a5", bg: "#3a3a40" },
  { name: "outline", fg: "#4ade80", bg: "#1c1c1e" },
  { name: "outline-hover", fg: "#4ade80", bg: "#052e16" },
  { name: "outline-disabled", fg: "#86efac", bg: "#1c1c1e" },
  { name: "ghost", fg: "#f7f7f8", bg: "#101012" },
  { name: "ghost-hover", fg: "#f7f7f8", bg: "#2a2a2e" },
  { name: "ghost-disabled", fg: "#d4d4d8", bg: "#101012" },
  { name: "issue", fg: "#1c1917", bg: "#f59e0b" },
  { name: "retake", fg: "#1c1917", bg: "#f97316" },
  { name: "choice-error", fg: "#fecaca", bg: "#1c1c1e" },
  { name: "status-ready-idle", fg: "#4ade80", bg: "#1c1c1e" },
  { name: "status-ready-hover", fg: "#4ade80", bg: "#052e16" },
  { name: "status-work-idle", fg: "#fbbf24", bg: "#1c1c1e" },
  { name: "status-work-hover", fg: "#fde68a", bg: "#451a03" },
  { name: "status-oos-idle", fg: "#fca5a5", bg: "#1c1c1e" },
  { name: "chip-idle", fg: "#e4e4e7", bg: "#3a3a40" },
  { name: "chip-disabled", fg: "#d4d4d8", bg: "#2a2a2e" },
  { name: "overlay", fg: "#f7f7f8", bg: "#101012" },
  { name: "damage-flag", fg: "#7f1d1d", bg: "#fee2e2" },
  { name: "traffic-yellow", fg: "#451a03", bg: "#fbbf24" },
  { name: "ev-selected", fg: "#0c4a6e", bg: "#e0f2fe" },
  { name: "remove", fg: "#fca5a5", bg: "#101012" },
] as const;

const lock = "disabled:opacity-100 disabled:pointer-events-none";

export const primaryButtonClass = [
  "bg-[#22c55e] text-[#052e16]",
  "hover:bg-[#4ade80] active:bg-[#16a34a]",
  "disabled:bg-[#14532d] disabled:text-[#ecfdf5]",
  lock,
].join(" ");

export const secondaryButtonClass = [
  "bg-[#2a2a2e] text-[#f7f7f8]",
  "hover:bg-[#3a3a40] active:bg-[#3a3a40]",
  "disabled:bg-[#1c1c1e] disabled:text-[#d4d4d8]",
  lock,
].join(" ");

export const secondaryOutlineButtonClass = [
  "border border-[#6e6e76] bg-[#1c1c1e] text-[#f7f7f8]",
  "hover:bg-[#2a2a2e]",
  "disabled:border-[#3a3a40] disabled:bg-[#1c1c1e] disabled:text-[#d4d4d8]",
  lock,
].join(" ");

export const dangerButtonClass = [
  "bg-[#b91c1c] text-white",
  "hover:bg-[#991b1b] active:bg-[#7f1d1d]",
  "disabled:bg-[#7f1d1d] disabled:text-[#fee2e2]",
  lock,
].join(" ");

export const dangerOutlineButtonClass = [
  "border border-[#fca5a5] bg-[#1c1c1e] text-[#fca5a5]",
  "hover:bg-[#7f1d1d] hover:text-[#fee2e2]",
  "disabled:border-[#fca5a5] disabled:bg-[#3a3a40] disabled:text-[#fca5a5]",
  lock,
].join(" ");

export const outlineButtonClass = [
  "border-2 border-[#22c55e] bg-[#1c1c1e] text-[#4ade80]",
  "hover:bg-[#052e16] hover:text-[#4ade80]",
  "disabled:border-[#166534] disabled:bg-[#1c1c1e] disabled:text-[#86efac]",
  lock,
].join(" ");

export const ghostButtonClass = [
  "bg-transparent text-[#f7f7f8]",
  "hover:bg-[#2a2a2e]",
  "disabled:bg-transparent disabled:text-[#d4d4d8]",
  lock,
].join(" ");

export const choiceOkClass = "border-[#166534] bg-[#22c55e] text-[#052e16]";
export const choiceIssueClass = "border-[#b45309] bg-[#f59e0b] text-[#1c1917]";
export const choiceErrorClass = "border-[#f87171] bg-[#1c1c1e] text-[#fecaca]";
export const choiceRetakeClass = "bg-[#f97316] text-[#1c1917]";
