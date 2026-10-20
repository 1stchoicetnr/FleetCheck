"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { runFleetSync } from "@/lib/run-fleet-sync";

/** Cache server fleets on this phone and upload vehicles that exist only here. */
export function PhoneFleetSync() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    void runFleetSync();
  }, [user, loading]);

  return null;
}
