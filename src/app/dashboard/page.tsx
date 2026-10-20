"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { canViewFleetOverview } from "@/lib/fleet-config";
import {
  canAddVehicle,
  canSeeAlerts,
  canStartCheck,
  homeTiles,
  type HomeTileId,
} from "@/lib/home-menu";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FleetStatusStats } from "@/components/fleet-status-stats";
import { fetchCheckoutReports, fetchOfficeAlerts } from "@/lib/checkout-api";
import { getAlerts } from "@/lib/storage";
import {
  Bell,
  Car,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";

const TILES: Record<
  HomeTileId,
  { href: string; label: string; desc: string; color: string; icon: typeof Bell }
> = {
  "my-checks": {
    href: "/my-checks",
    label: "My recent checks",
    desc: "Saved on phone, uploading, or sent",
    color: "bg-sky-100 text-sky-800",
    icon: ClipboardList,
  },
  office: {
    href: "/office",
    label: "Office review",
    desc: "PASS, conditional, or fail",
    color: "bg-indigo-100 text-indigo-700",
    icon: ShieldCheck,
  },
  alerts: {
    href: "/alerts",
    label: "Alerts",
    desc: "Damage, status, and known issues",
    color: "bg-amber-100 text-amber-800",
    icon: Bell,
  },
  vehicles: {
    href: "/vehicles",
    label: "Vehicles",
    desc: "The fleet, including archived units",
    color: "bg-emerald-100 text-emerald-800",
    icon: Car,
  },
  settings: {
    href: "/settings",
    label: "Settings",
    desc: "Company, notifications, and people",
    color: "bg-violet-100 text-violet-800",
    icon: SlidersHorizontal,
  },
  reports: {
    href: "/reports",
    label: "Issue reports",
    desc: "Problems reported from the field",
    color: "bg-rose-100 text-rose-800",
    icon: FileWarning,
  },
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [alertCount, setAlertCount] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !canSeeAlerts(user.role)) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await fetchCheckoutReports({ limit: 1 });
        if (!cancelled) setReviewCount(page.flagged);
      } catch {
        if (!cancelled) setReviewCount(null);
      }
      try {
        const [local, remote] = await Promise.all([
          getAlerts(false),
          fetchOfficeAlerts().catch(() => []),
        ]);
        const seen = new Set<string>();
        let open = 0;
        for (const alert of [...local, ...remote]) {
          if (seen.has(alert.id)) continue;
          seen.add(alert.id);
          if (!alert.read && !alert.archivedAt) open += 1;
        }
        if (!cancelled) setAlertCount(open);
      } catch {
        if (!cancelled) setAlertCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-brand-600 font-semibold">Loading...</div>
      </div>
    );
  }

  const tiles = homeTiles(user);
  const badges: Partial<Record<HomeTileId, number | null>> = {
    office: reviewCount,
    alerts: alertCount,
  };

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader title="Dashboard" showBack={false} />
      <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
        <div>
          <h2 className="text-2xl font-bold text-ink">Hello, {user.name}</h2>
          <p className="text-muted text-sm">What would you like to do?</p>
        </div>

        {canStartCheck(user.role) && (
          <Link href="/checkout" className="block">
            <div className="rounded-2xl bg-accent text-[#052e16] px-4 py-4 shadow-card active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-black/15 p-2.5">
                  <ClipboardCheck className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold leading-tight">Start a check</p>
                  <p className="text-[#14532d] text-sm mt-0.5 font-medium">
                    Precheck, then photos if it is OK to drive
                  </p>
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="grid gap-2">
          {tiles.map((id) => {
            const tile = TILES[id];
            const Icon = tile.icon;
            const badge = badges[id];
            const vehicleDesc =
              id === "vehicles" && canAddVehicle(user.role)
                ? "Fleet list, add, and archived units"
                : id === "vehicles" && user.role === "driver"
                  ? "Units you can check out"
                  : tile.desc;
            return (
              <Link key={id} href={tile.href}>
                <Card className="hover:shadow-md transition-shadow active:scale-[0.98]">
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className={`rounded-lg p-2 ${tile.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{tile.label}</CardTitle>
                      <p className="text-xs text-muted">{vehicleDesc}</p>
                    </div>
                    {typeof badge === "number" && (
                      <span className="min-w-6 h-6 px-1.5 rounded-full bg-red-600 text-white text-xs font-bold inline-flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {canViewFleetOverview(user.role) && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">
              Fleet status
            </h3>
            <FleetStatusStats />
          </div>
        )}
      </div>
    </div>
  );
}
