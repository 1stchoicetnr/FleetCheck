"use client";

import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/types";
import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";

export function AppHeader({ title }: { title?: string }) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          {title ? (
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          ) : (
            <Link href="/dashboard" className="text-lg font-bold text-brand-600">
              FleetCheck
            </Link>
          )}
          {user && (
            <p className="text-xs text-gray-500">
              {user.name} · {ROLE_LABELS[user.role]}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
          >
            <UserIcon className="h-5 w-5" />
          </Link>
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Log out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
