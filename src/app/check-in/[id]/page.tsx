import { redirect } from "next/navigation";

/** Legacy Slack-PDF Check In is retired on this branch — Office only reads Neon CRs. */
export default function LegacyCheckInDetailRedirect() {
  redirect("/checkout");
}
