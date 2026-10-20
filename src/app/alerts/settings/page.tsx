import { redirect } from "next/navigation";

export default function AlertSettingsRedirect() {
  redirect("/settings?section=notifications");
}
