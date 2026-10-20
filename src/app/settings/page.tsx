"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { OfficePinGate } from "@/components/office-pin-gate";
import { CompanySettingsPanel } from "@/components/company-settings-panel";
import { NotificationSettingsPanel } from "@/components/notification-settings-panel";
import { PeopleSettingsPanel } from "@/components/people-settings-panel";
import { useAuth } from "@/hooks/use-auth";
import { canEditFleets, settingsSections, type SettingsSectionId } from "@/lib/home-menu";
import { FleetManager } from "@/components/fleet-manager";

const LABELS: Record<SettingsSectionId, string> = {
  company: "Company",
  notifications: "Notifications",
  people: "People",
};

function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sections = user ? settingsSections(user) : [];
  const sectionKey = sections.join("|");
  const needsPin = sections.includes("company") || sections.includes("people");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && sections.length === 0) router.replace("/dashboard");
  }, [user, loading, router, sections.length]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (!section) return;
    const node = document.getElementById(section);
    if (node) node.scrollIntoView({ block: "start" });
  }, [searchParams, sectionKey]);

  if (loading || !user) return null;

  const body = (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
      <div className="flex gap-2">
        {sections.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink"
          >
            {LABELS[id]}
          </a>
        ))}
      </div>
      {sections.includes("company") && <CompanySettingsPanel />}
      {sections.includes("company") && user ? (
        <FleetManager canEdit={canEditFleets(user)} />
      ) : null}
      {sections.includes("notifications") && <NotificationSettingsPanel />}
      {sections.includes("people") && <PeopleSettingsPanel />}
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader title="Settings" backHref="/dashboard" />
      {needsPin ? <OfficePinGate>{body}</OfficePinGate> : body}
    </div>
  );
}

export default function SettingsRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-brand-600">Loading...</div>
        </div>
      }
    >
      <SettingsPage />
    </Suspense>
  );
}
