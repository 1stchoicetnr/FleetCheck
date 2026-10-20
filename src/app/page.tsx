"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@/lib/types";
import { Truck, Shield, Wrench, Car, ChevronRight } from "lucide-react";
import { INSPEKT_ICON, INSPEKT_ICON_LARGE, INSPEKT_NAVY } from "@/lib/brand-mark";

const LOGIN_OPTIONS: {
  role: UserRole;
  title: string;
  description: string;
  icon: typeof Car;
  color: string;
  bg: string;
  href?: string;
}[] = [
  {
    role: "driver",
    title: "Driver",
    description: "Checkout Report — the only path Office can see",
    icon: Car,
    color: "text-emerald-300",
    bg: "bg-surface hover:bg-raised border-line",
    href: "/checkout",
  },
  {
    role: "management",
    title: "Office",
    description: "Review checkout reports",
    icon: Truck,
    color: "text-sky-300",
    bg: "bg-surface hover:bg-raised border-line",
    href: "/office",
  },
  {
    role: "tech",
    title: "Tech",
    description: "Maintenance alerts and vehicle status",
    icon: Wrench,
    color: "text-orange-300",
    bg: "bg-surface hover:bg-raised border-line",
  },
  {
    role: "super_admin",
    title: "Super Admin",
    description: "Full access — can override steps",
    icon: Shield,
    color: "text-violet-300",
    bg: "bg-surface hover:bg-raised border-line",
  },
];

export default function LoginPage() {
  const { user, loginAsRole, loading } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState<UserRole | null>(null);
  const [error, setError] = useState("");
  const destRef = useRef("/dashboard");

  useLayoutEffect(() => {
    if (!loading && user) {
      router.replace(destRef.current);
    }
  }, [user, loading, router]);

  const handleSelect = async (role: UserRole, href = "/dashboard") => {
    destRef.current = href;
    setError("");
    setSigningIn(role);
    try {
      const ok = await loginAsRole(role);
      if (!ok) {
        setError("Could not sign in. Please refresh and try again.");
      } else {
        router.replace(href);
      }
    } catch {
      setError("Something went wrong. Please refresh and try again.");
    } finally {
      setSigningIn(null);
    }
  };

  if (loading || user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: INSPEKT_NAVY }}
      >
        <Image
          src={INSPEKT_ICON_LARGE}
          alt=""
          width={512}
          height={512}
          priority
          unoptimized
          className="h-[100vmin] w-[100vmin] max-w-none"
        />
        <span className="sr-only">
          {user ? "Opening dashboard..." : "Loading Inspekt..."}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <div className="px-6 pt-12 pb-6 text-center">
        <Image
          src={INSPEKT_ICON}
          unoptimized
          alt=""
          width={88}
          height={88}
          priority
          className="mx-auto mb-4 h-[88px] w-[88px] drop-shadow-lg"
        />
        <h1 className="text-3xl font-bold tracking-tight">Inspekt</h1>
        <p className="text-muted mt-2 text-base">
          Vehicle docs, damage tracking & accountability
        </p>
      </div>

      <div className="flex-1 px-4 pb-10 max-w-lg mx-auto w-full">
        <h2 className="text-xl font-bold text-ink mb-2 text-center">
          Select your role to continue
        </h2>
        <p className="text-muted text-center mb-4">
          Tap your role below to sign in
        </p>
        <p className="text-sm text-center text-emerald-100 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 mb-6">
          Office only lists <strong>Checkout Reports</strong>. The old Check In /
          Out Slack PDF does not appear in Office.
        </p>

        <button
          type="button"
          disabled={signingIn !== null}
          onClick={() => handleSelect("driver", "/checkout")}
          className="w-full mb-4 rounded-2xl bg-accent text-[#052e16] p-5 text-left shadow-card active:scale-[0.98] disabled:opacity-60 min-h-[80px]"
        >
          <p className="text-xl font-bold">Start Checkout Report</p>
          <p className="text-[#14532d] text-sm mt-1 font-medium">
            Dispatchers: use this. Office reviews these reports only.
          </p>
        </button>

        <div className="space-y-4">
          {LOGIN_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isLoading = signingIn === option.role;
            return (
              <button
                key={option.role}
                type="button"
                disabled={signingIn !== null}
                onClick={() => handleSelect(option.role, option.href)}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all active:scale-[0.98] min-h-[80px] disabled:opacity-60 ${option.bg}`}
              >
                <div className={`rounded-xl p-3 bg-raised ${option.color}`}>
                  <Icon className="h-8 w-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-gray-900">
                    {option.title}
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {isLoading ? "Signing in..." : option.description}
                  </p>
                </div>
                <ChevronRight
                  className={`h-6 w-6 flex-shrink-0 ${option.color}`}
                />
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-red-600 text-sm text-center mt-4 font-medium">
            {error}
          </p>
        )}

        <p className="text-xs text-gray-400 text-center mt-8">
          Demo mode — no password required
        </p>
      </div>
    </div>
  );
}
