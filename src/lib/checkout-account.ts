/** Shown when a check cannot be sent because nobody approved is signed in. */
export const CHECKOUT_ACCOUNT_MESSAGE =
  "Sign in first. If you don't have an account yet, ask the office to add you. Your check stays on this phone. Meanwhile, post it in Slack the way you did before.";

/** Auth failures must keep retrying so a later sign-in can send the queued check. */
export function checkoutAuthCanRetry(
  status: number | undefined,
  message: string
): boolean {
  if (status === 401) return true;
  return message.includes("Sign in first");
}
