"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { UserRole, ROLE_LABELS } from "@/lib/types";
import { Truck, Shield, Wrench, Car, ChevronRight } from "lucide-react";

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
    color: "text-green-700",
    bg: "bg-green-100 hover:bg-green-200 border-green-300",
    href: "/checkout",
  },
  {
    role: "management",
    title: "Office",
    description: "Review checkout reports — PIN 1357",
    icon: Truck,
    color: "text-indigo-700",
    bg: "bg-indigo-100 hover:bg-indigo-200 border-indigo-300",
    href: "/office",
  },
  {
    role: "tech",
    title: "Tech",
    description: "Maintenance alerts and vehicle status",
    icon: Wrench,
    color: "text-orange-700",
    bg: "bg-orange-100 hover:bg-orange-200 border-orange-300",
  },
  {
    role: "super_admin",
    title: "Super Admin",
    description: "Full access — can override steps",
    icon: Shield,
    color: "text-purple-700",
    bg: "bg-purple-100 hover:bg-purple-200 border-purple-300",
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-brand-600 font-semibold text-lg">
          {user ? "Opening dashboard..." : "Loading FleetCheck..."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="bg-brand-600 text-white px-6 py-10 text-center">
        <div className="inline-flex bg-white/20 rounded-2xl p-4 mb-4">
          <Truck className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-bold">FleetCheck</h1>
        <p className="text-brand-100 mt-2 text-base">
          Vehicle docs, damage tracking & accountability
        </p>
      </div>

      <div className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
          Select your role to continue
        </h2>
        <p className="text-gray-500 text-center mb-4">
          Tap your role below to sign in
        </p>
        <p className="text-sm text-center text-brand-800 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 mb-6">
          Office only lists <strong>Checkout Reports</strong>. The old Check In /
          Out Slack PDF does not appear in Office.
        </p>

        <button
          type="button"
          disabled={signingIn !== null}
          onClick={() => handleSelect("driver", "/checkout")}
          className="w-full mb-4 rounded-2xl bg-brand-600 text-white p-5 text-left shadow-md active:scale-[0.98] disabled:opacity-60"
        >
          <p className="text-xl font-bold">Start Checkout Report</p>
          <p className="text-brand-100 text-sm mt-1">
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
                <div className={`rounded-xl p-3 bg-white/70 ${option.color}`}>
                  <Icon className="h-8 w-8" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-gray-900">
                    {option.title}
                  </p>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {isLoading ? "Signing in..." : option.description}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {ROLE_LABELS[option.role]}
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
