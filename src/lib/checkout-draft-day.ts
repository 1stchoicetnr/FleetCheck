import { freshCheckoutDraftId } from "./checkout-idempotency";
import { calendarDayInZone } from "./rollout-slate";

/** Driver-facing dates use Pacific time, including across midnight. */
export const CHECK_DAY_ZONE = "America/Los_Angeles";

export function pacificCalendarDay(iso: string | undefined, now?: Date): string | null {
  if (iso) return calendarDayInZone(iso, CHECK_DAY_ZONE);
  if (now) return calendarDayInZone(now.toISOString(), CHECK_DAY_ZONE);
  return null;
}

/**
 * A draft is from an earlier Pacific day when its signature or last save is.
 * A signature from yesterday must not ride along on a draft touched today:
 * the idempotency key is the draft id plus signedAt, so reusing it replays
 * yesterday's server row.
 */
export function draftIsPreviousPacificDay(
  draft: { updatedAt?: string; signedAt?: string },
  now: Date = new Date()
): boolean {
  const today = pacificCalendarDay(undefined, now);
  if (!today) return false;
  const signed = pacificCalendarDay(draft.signedAt);
  const updated = pacificCalendarDay(draft.updatedAt);
  if (signed && signed < today) return true;
  if (updated && updated < today) return true;
  return false;
}

/** Stable id for today's check of this driver, unit, and type. */
export function checkoutDraftIdForDay(baseId: string, now: Date = new Date()): string {
  const day = pacificCalendarDay(undefined, now) ?? "undated";
  return `${baseId}-${day}`;
}

export interface DraftStamp {
  id: string;
  updatedAt?: string;
  signedAt?: string;
}

/** Previous-day drafts with nothing waiting to send. The outbox still needs its draft. */
export function stalePreviousDayDraftIds(
  drafts: DraftStamp[],
  waitingDraftIds: string[],
  now: Date = new Date()
): string[] {
  const waiting = new Set(waitingDraftIds);
  return drafts
    .filter((draft) => !waiting.has(draft.id) && draftIsPreviousPacificDay(draft, now))
    .map((draft) => draft.id);
}

export interface CheckoutDraftChoice {
  /** Id to save. A previous-day draft never keeps the old id. */
  id: string;
  /** Copy photos, signature, and signedAt. False starts empty. */
  reuseContent: boolean;
  deleteDraftIds: string[];
}

export interface CarriedDraftContent<TPhotos, TFlags, TForm> {
  photos: TPhotos;
  photoFlags?: TFlags;
  signatureDataUrl?: string;
  signedAt?: string;
  inspectionForm?: TForm;
}

/** Photos, signature, and signedAt move forward only when this check is still today's. */
export function draftContentToCarry<TPhotos extends object, TFlags, TForm>(
  draft:
    | {
        photos?: TPhotos;
        photoFlags?: TFlags;
        signatureDataUrl?: string;
        signedAt?: string;
        inspectionForm?: TForm;
      }
    | null
    | undefined,
  reuseContent: boolean
): CarriedDraftContent<TPhotos, TFlags, TForm> {
  if (!reuseContent || !draft) {
    return { photos: {} as TPhotos };
  }
  return {
    photos: draft.photos ?? ({} as TPhotos),
    photoFlags: draft.photoFlags,
    signatureDataUrl: draft.signatureDataUrl,
    signedAt: draft.signedAt,
    inspectionForm: draft.inspectionForm,
  };
}

function reusableToday(
  draft: DraftStamp | null | undefined,
  id: string,
  waiting: string[],
  datedId: string,
  now: Date,
  deleteDraftIds: string[]
): CheckoutDraftChoice | null {
  if (!draft || draftIsPreviousPacificDay(draft, now)) return null;
  if (waiting.includes(id)) {
    return {
      id: freshCheckoutDraftId(datedId, waiting, now.getTime()),
      reuseContent: false,
      deleteDraftIds,
    };
  }
  return { id, reuseContent: true, deleteDraftIds };
}

/**
 * Same-day resume keeps the in-progress draft. A draft signed or saved on an
 * earlier Pacific day starts over: new id, no photos, no signature, no signedAt.
 * A check still in the outbox does not block today's new report.
 */
export function chooseCheckoutDraft(input: {
  baseId: string;
  drafts: DraftStamp[];
  waitingDraftIds: string[];
  now?: Date;
  /** Explicit edit of a check already open on this phone. */
  editingId?: string;
}): CheckoutDraftChoice {
  const now = input.now ?? new Date();
  const datedId = checkoutDraftIdForDay(input.baseId, now);
  const waiting = input.waitingDraftIds;
  const deleteDraftIds = stalePreviousDayDraftIds(input.drafts, waiting, now);
  const baseDraft = input.drafts.find((draft) => draft.id === input.baseId) ?? null;
  const datedDraft = input.drafts.find((draft) => draft.id === datedId) ?? null;

  const finish = (choice: CheckoutDraftChoice): CheckoutDraftChoice => ({
    ...choice,
    deleteDraftIds: choice.deleteDraftIds.filter((id) => id !== choice.id),
  });

  if (input.editingId) {
    const edited = input.drafts.find((draft) => draft.id === input.editingId) ?? null;
    const same = reusableToday(edited, input.editingId, waiting, datedId, now, deleteDraftIds);
    if (same) return finish(same);
    return finish({
      id: waiting.includes(datedId) ? freshCheckoutDraftId(datedId, waiting, now.getTime()) : datedId,
      reuseContent: false,
      deleteDraftIds,
    });
  }

  const datedChoice = reusableToday(datedDraft, datedId, waiting, datedId, now, deleteDraftIds);
  if (datedChoice) return finish(datedChoice);
  const baseChoice = reusableToday(baseDraft, input.baseId, waiting, datedId, now, deleteDraftIds);
  if (baseChoice) return finish(baseChoice);

  return finish({
    id: waiting.includes(datedId) ? freshCheckoutDraftId(datedId, waiting, now.getTime()) : datedId,
    reuseContent: false,
    deleteDraftIds,
  });
}

/** When the driver finished this queued check, for the Pacific-day rule. */
export function outboxActivityIso(item: {
  signedAt?: string;
  capturedAt?: string;
  createdAt?: string;
  photos?: Array<{ capturedAt?: string }>;
}): string | undefined {
  return item.signedAt || item.capturedAt || item.photos?.[0]?.capturedAt || item.createdAt;
}

/**
 * Plain words for a check that is still on this phone from an earlier Pacific day.
 * Finish sending retries that check. It does not open a second report.
 */
export function previousDayOutboxMessage(
  item: {
    unitNumber?: string;
    signedAt?: string;
    capturedAt?: string;
    createdAt?: string;
    photos?: Array<{ capturedAt?: string }>;
  },
  now: Date = new Date()
): string | null {
  const when = outboxActivityIso(item);
  if (!when || !draftIsPreviousPacificDay({ signedAt: when }, now)) return null;
  const unit = item.unitNumber?.trim().replace(/^#/, "");
  const subject = unit ? `Yesterday's Unit ${unit} check` : "Yesterday's check";
  return `${subject} is still sending. Tap Finish sending. This won't create a second report.`;
}
