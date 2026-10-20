import { FeedbackPayload, feedbackSlackBody } from "@/lib/feedback";

export function feedbackSlackWebhook(): string | undefined {
  const url = process.env.SLACK_WEBHOOK_FEEDBACK?.trim();
  return url || undefined;
}

/**
 * Post app feedback to SLACK_WEBHOOK_FEEDBACK.
 * The webhook URL is bound to one conversation. Create it as a DM with @ashley.
 * Slack ignores a channel override on incoming webhooks, so this payload does not set one.
 */
export async function postFeedbackToSlack(input: {
  payload: FeedbackPayload;
  screenshotUrl?: string;
}): Promise<void> {
  const url = feedbackSlackWebhook();
  if (!url) throw new Error("SLACK_WEBHOOK_FEEDBACK is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedbackSlackBody(input)),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 180);
    throw new Error(detail || `Slack webhook failed (${res.status})`);
  }
}
