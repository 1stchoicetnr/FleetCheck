"use client";

import { CheckoutFeedbackButton } from "@/components/checkout-feedback";
import { useAuth } from "@/hooks/use-auth";
import Image from "next/image";
import { ROLE_LABELS } from "@/lib/types";
import { INSPEKT_ICON } from "@/lib/brand-mark";
import { requestTourReplay } from "@/lib/tour";
import { ArrowLeft, Home, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  const onDashboard = pathname === "/dashboard" || title === "Dashboard";
  const onCheckout = pathname.startsWith("/checkout");

  const shouldShowBack = showBack ?? (!!title && !onDashboard);
  const roleLabel = user?.roleTitle || (user ? ROLE_LABELS[user.role] : "");
  const subtitle =
    user && user.name.trim().toLowerCase() === roleLabel.trim().toLowerCase()
      ? roleLabel
      : user
        ? `${user.name} · ${roleLabel}`
        : "";

  const handleBack = useCallback(() => {
    router.push(backHref);
  }, [backHref, router]);

  const goHome = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  return (
    <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-line">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
        {shouldShowBack ? (
          <button
            type="button"
            onClick={handleBack}
            className="flex-shrink-0 p-2 -ml-2 rounded-xl hover:bg-raised text-ink active:bg-line min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Go back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-10 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Image
            src={INSPEKT_ICON}
            unoptimized
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 flex-shrink-0"
          />
          <div className="min-w-0">
            {title ? (
              <h1 className="text-lg font-bold text-gray-900 truncate">{title}</h1>
            ) : (
              <Link
                href="/dashboard"
                className="text-lg font-bold text-gray-900 inline-block py-1"
              >
                Inspekt
              </Link>
            )}
            {user && (
              <p className="text-xs text-muted truncate">{subtitle}</p>
            )}
          </div>
        </div>

        {onCheckout && <CheckoutFeedbackButton />}

        {!onDashboard && (
          <button
            type="button"
            onClick={goHome}
            className="flex-shrink-0 p-2 rounded-xl hover:bg-raised text-accent active:bg-line min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Home — go to dashboard"
          >
            <Home className="h-5 w-5" />
          </button>
        )}

        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="p-2 rounded-xl hover:bg-raised text-muted active:bg-line min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-[70] w-48 rounded-xl border border-line bg-white shadow-lg py-1">
              <button
                type="button"
                className="block w-full text-left px-3 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                onClick={() => {
                  setMenuOpen(false);
                  requestTourReplay();
                }}
              >
                Show the tour
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
