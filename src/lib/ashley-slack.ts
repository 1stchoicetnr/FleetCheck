import { postSlackMessage, type CheckoutFetch } from "./checkout-slack.ts";

/** Ashley's Slack user. Direct messages go here and nowhere else. */
export const ASHLEY_SLACK_DM = "DHPKVTEBD";

export async function postAshleySlackDm(
  text: string,
  options: {
    token?: string | null;
    webhookUrl?: string | null;
    fetchImpl?: CheckoutFetch;
  }
): Promise<"bot" | "webhook" | "skipped"> {
  const send = options.fetchImpl ?? fetch;
  const token = options.token?.trim();
  if (token) {
    const response = await send("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: ASHLEY_SLACK_DM,
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    if (!response.ok) throw new Error("slack");
    return "bot";
  }
  const webhook = options.webhookUrl?.trim();
  if (!webhook) return "skipped";
  await postSlackMessage(webhook, text, send);
  return "webhook";
}
