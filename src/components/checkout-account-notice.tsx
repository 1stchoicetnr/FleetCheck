"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CHECKOUT_ACCOUNT_MESSAGE } from "@/lib/checkout-account";

export function signInHref(returnTo: string): string {
  return `/?next=${encodeURIComponent(returnTo)}`;
}

export function CheckoutAccountNotice() {
  const pathname = usePathname() || "/checkout";
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Sign in to send this check" backHref="/" />
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-4 text-amber-950 space-y-3">
          <p className="text-lg font-bold">This check is still on this phone</p>
          <p className="text-sm leading-relaxed">{CHECKOUT_ACCOUNT_MESSAGE}</p>
          <Link
            href={signInHref(pathname)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-bold text-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CheckoutAccountBanner() {
  const pathname = usePathname() || "/checkout";
  return (
    <div className="mx-4 mt-3 rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950 space-y-2">
      <p className="font-bold">This check is still on this phone</p>
      <p className="text-sm leading-relaxed">{CHECKOUT_ACCOUNT_MESSAGE}</p>
      <Link href={signInHref(pathname)} className="inline-flex text-sm font-bold underline">
        Sign in
      </Link>
    </div>
  );
}
