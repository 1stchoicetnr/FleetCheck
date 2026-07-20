"use client";

import { useOnlineStatus, usePendingSync } from "@/hooks/use-offline";
import { Wifi, WifiOff, CloudOff } from "lucide-react";

export function OfflineBanner() {
  const online = useOnlineStatus();
  const pending = usePendingSync();

  if (online && pending === 0) return null;

  return (
    <div
      className={`px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 ${
        online
          ? "bg-yellow-50 text-yellow-800"
          : "bg-orange-50 text-orange-800"
      }`}
    >
      {!online ? (
        <>
          <WifiOff className="h-4 w-4" />
          Offline mode — changes saved locally
        </>
      ) : pending > 0 ? (
        <>
          <CloudOff className="h-4 w-4" />
          {pending} record{pending > 1 ? "s" : ""} waiting to sync
        </>
      ) : (
        <>
          <Wifi className="h-4 w-4" />
          Back online
        </>
      )}
    </div>
  );
}
