/** Wording matches whether Resend actually accepted the message. */
export function setupLinkHandoff(emailed: boolean): string {
  if (emailed) {
    return "Emailed to them. The link is also here if you need to pass it on. It expires";
  }
  return "It was not emailed. Pass this link on. It expires";
}
