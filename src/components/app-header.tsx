"use client";

import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/types";
import { ArrowLeft, Home, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

interface AppHeaderProps {
  title?: string;
  /** Where the back button navigates. Defaults to /dashboard */
  backHref?: string;
  /** Show back button. Auto-enabled for titled pages except Dashboard */
  showBack?: boolean;
}

export function AppHeader({
  title,
  backHref = "/dashboard",
  showBack,
}: AppHeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard" || title === "Dashboard";

  const shouldShowBack = showBack ?? (!!title && !onDashboard);

  const handleBack = useCallback(() => {
    router.push(backHref);
  }, [backHref, router]);

  const goHome = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
        {shouldShowBack ? (
          <button
            type="button"
            onClick={handleBack}
            className="flex-shrink-0 p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-700 active:bg-gray-200 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-10 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {title ? (
            <h1 className="text-lg font-bold text-gray-900 truncate">{title}</h1>
          ) : (
            <Link
              href="/dashboard"
              className="text-lg font-bold text-brand-600 inline-block py-1"
            >
              FleetCheck
            </Link>
          )}
          {user && (
            <p className="text-xs text-gray-500 truncate">
              {user.name} · {ROLE_LABELS[user.role]}
            </p>
          )}
        </div>

        {!onDashboard && (
          <button
            type="button"
            onClick={goHome}
            className="flex-shrink-0 p-2 rounded-xl hover:bg-gray-100 text-brand-700 active:bg-gray-200 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Home — go to dashboard"
          >
            <Home className="h-5 w-5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => logout()}
          className="flex-shrink-0 p-2 rounded-xl hover:bg-gray-100 text-gray-600 active:bg-gray-200 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
