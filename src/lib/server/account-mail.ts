export type AccountMail = {
  to: string;
  subject: string;
  text: string;
};

export type AccountMailResult = { emailed: boolean };

type MailEnv = Record<string, string | undefined>;

export function accountMailConfigured(env: MailEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.RESEND_FROM?.trim());
}

export function setupEmailText(input: {
  name: string;
  url: string;
  kind: "invite" | "setup";
}): string {
  const action =
    input.kind === "invite"
      ? "set up your Inspekt sign-in"
      : "choose a new Inspekt password";
  return [
    `Hi ${input.name},`,
    "",
    `Use this one-time link to ${action}:`,
    input.url,
    "",
    "The link expires in 7 days and works once.",
    "",
  ].join("\n");
}

export function approvedEmailText(input: { name: string; signInUrl: string }): string {
  return [
    `Hi ${input.name},`,
    "",
    "You're approved on Inspekt. Sign in with the password you already chose:",
    input.signInUrl,
    "",
  ].join("\n");
}

/** Send through Resend. A missing key or a failed send leaves the link on screen. */
export async function sendAccountMail(
  message: AccountMail,
  env: MailEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<AccountMailResult> {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  if (!key || !from) return { emailed: false };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) return { emailed: false };
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    return { emailed: res.ok };
  } catch {
    return { emailed: false };
  }
}
