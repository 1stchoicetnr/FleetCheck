import { FeedbackPayload, formatFeedbackSlack } from "@/lib/feedback";

export function feedbackSlackWebhook(): string | undefined {
  const url = process.env.SLACK_WEBHOOK_FEEDBACK?.trim();
  return url || undefined;
}

/** Post app feedback to the Slack incoming webhook. Throws if Slack rejects it. */
export async function postFeedbackToSlack(input: {
  payload: FeedbackPayload;
  screenshotUrl?: string;
}): Promise<void> {
  const url = feedbackSlackWebhook();
  if (!url) throw new Error("SLACK_WEBHOOK_FEEDBACK is not set");
  const { text, imageUrl } = formatFeedbackSlack(input);
  const blocks: Array<Record<string, unknown>> = [
    { type: "section", text: { type: "mrkdwn", text } },
  ];
  if (imageUrl) {
    blocks.push({
      type: "image",
      image_url: imageUrl,
      alt_text: "Feedback screenshot",
    });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      blocks,
      username: "FleetCheck",
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 180);
    throw new Error(detail || `Slack webhook failed (${res.status})`);
  }
}
