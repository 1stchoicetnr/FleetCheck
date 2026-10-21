export type SlackFetch = (url: string, init: RequestInit) => Promise<Response>;

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 200);
}

export function accessRequestWebhook(): string | undefined {
  const url = process.env.SLACK_WEBHOOK_FEEDBACK?.trim();
  return url || undefined;
}

/** Same incoming webhook as app feedback. It is bound to a DM with @ashley. */
export function accessRequestSlackBody(input: { name: string; email: string; phone: string }) {
  return {
    text: [
      "New Inspekt access request for @ashley",
      oneLine(input.name),
      oneLine(input.email),
      oneLine(input.phone),
    ].join("\n"),
  };
}

export async function postAccessRequestToSlack(
  input: { name: string; email: string; phone: string },
  fetchImpl: SlackFetch = fetch
): Promise<boolean> {
  const url = accessRequestWebhook();
  if (!url) return false;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(accessRequestSlackBody(input)),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 180);
    throw new Error(detail || `Slack webhook failed (${res.status})`);
  }
  return true;
}
