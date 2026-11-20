"use client";

import { useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setVehicleOutOfService, type SharedVehicle } from "@/lib/checkout-api";
import { canReturnToReady, canSetOutOfService } from "@/lib/out-of-service";
import { accessRank, type AccessUser } from "@/lib/role-access";
import { formatCheckoutTime } from "@/lib/checkout-slack";

/** Office sets Out of Service (drivers can't start a check-out); Manager/Owner sets it back to Ready. */
export function OutOfServiceControl({
  vehicle,
  user,
  onChange,
}: {
  vehicle: SharedVehicle;
  user: AccessUser;
  onChange: (vehicle: SharedVehicle) => void;
}) {
  const rank = accessRank(user);
  const canSet = canSetOutOfService(rank);
  const canClear = canReturnToReady(rank);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const oos = vehicle.outOfService;

  async function update(next: boolean) {
    setBusy(true);
    setError("");
    try {
      onChange(await setVehicleOutOfService(vehicle.id, next, next ? reason.trim() || undefined : undefined));
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Service status</CardTitle>
          <span
            className={
              oos
                ? "rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white"
                : "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800"
            }
          >
            {oos ? "Out of Service" : "Ready"}
          </span>
        </div>
        {oos ? (
          <>
            <p className="text-sm text-gray-700">
              Set by {oos.by} · {formatCheckoutTime(oos.since)}
              {oos.reason ? ` · ${oos.reason}` : ""}
            </p>
            <p className="text-sm text-gray-600">Drivers can&apos;t start a check-out on this unit.</p>
            {canClear ? (
              <Button type="button" className="w-full" disabled={busy} onClick={() => void update(false)}>
                {busy ? "Saving…" : "Set back to Ready"}
              </Button>
            ) : (
              <p className="text-xs text-gray-500">Only a Manager or Owner can set it back to Ready.</p>
            )}
          </>
        ) : (
          canSet && (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Reason (optional), e.g. front bumper hanging"
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-3 text-base"
              />
              <Button
                type="button"
                variant="danger"
                className="w-full"
                disabled={busy}
                onClick={() => void update(true)}
              >
                {busy ? "Saving…" : "Set Out of Service"}
              </Button>
              <p className="text-xs text-gray-500">
                Drivers are stopped from checking it out. Only a Manager or Owner can set it back to Ready.
              </p>
            </>
          )
        )}
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
