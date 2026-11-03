import { missingRequiredPhotos } from "./checkout-completion";
import { photoStepsForClient } from "./legacy-checkout";
import type { CheckoutReport, PhotoAngle, PhotoStep } from "./types";

export type FinishDecision =
  | { action: "skip"; reason: "sent" | "archived" }
  | { action: "wait"; missing: PhotoAngle[] }
  | { action: "send" };

/**
 * Should the server record this check as sent right now? Worked out from the
 * stored photos, not from the row's status flag, so it does not matter which
 * request (create, a photo batch, or a retry) happened to land the last photo.
 * Old-app checks treat slots that app never had (insurance) as optional.
 */
export function finishDecision(
  report: Pick<
    CheckoutReport,
    "idempotencyKey" | "createdAt" | "photos" | "inspectionForm" | "sentAt" | "archivedAt"
  >,
  companySteps: PhotoStep[]
): FinishDecision {
  if (report.sentAt) return { action: "skip", reason: "sent" };
  if (report.archivedAt) return { action: "skip", reason: "archived" };
  const missing = missingRequiredPhotos(report, photoStepsForClient(report, companySteps));
  return missing.length > 0 ? { action: "wait", missing } : { action: "send" };
}

/**
 * Re-check a check a few times while its photos are still arriving. Stops as
 * soon as it is sent or skipped. Used after an old-app create, because that app
 * never sends the "sent" step and nothing else runs until the office opens the list.
 */
export async function pollFinish(
  attempt: () => Promise<FinishDecision["action"]>,
  options: { tries: number; delayMs: number; sleep?: (ms: number) => Promise<void> }
): Promise<{ action: FinishDecision["action"]; tries: number }> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let action: FinishDecision["action"] = "wait";
  for (let i = 1; i <= options.tries; i += 1) {
    action = await attempt();
    if (action !== "wait") return { action, tries: i };
    if (i < options.tries) await sleep(options.delayMs);
  }
  return { action, tries: options.tries };
}
