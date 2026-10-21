"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFleets, type SharedFleet } from "@/lib/checkout-api";
import { primaryButtonClass, secondaryOutlineButtonClass } from "@/lib/button-styles";

type AccessRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
};

type Person = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  roleTitle: string;
};

type Issued = {
  url: string;
  qr: string;
  expiresAt: string;
  label: string;
};

export function AccessRequestsPanel({
  canGrantOwner,
  canResetPassword,
}: {
  canGrantOwner: boolean;
  canResetPassword: boolean;
}) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [fleets, setFleets] = useState<SharedFleet[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [fleetsChosen, setFleetsChosen] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);

  const load = useCallback(async () => {
    const [requestRes, fleetList] = await Promise.all([
      fetch("/api/auth/access-requests", { cache: "no-store" }),
      fetchFleets().catch(() => [] as SharedFleet[]),
    ]);
    const data = (await requestRes.json().catch(() => ({}))) as {
      requests?: AccessRequest[];
      error?: string;
    };
    if (!requestRes.ok) {
      setError(data.error || "Could not load access requests.");
      return;
    }
    setRequests(data.requests || []);
    setFleets(fleetList.filter((fleet) => !fleet.archivedAt));
    setError("");
    if (canResetPassword) {
      const peopleRes = await fetch("/api/auth/people", { cache: "no-store" });
      const peopleData = (await peopleRes.json().catch(() => ({}))) as { people?: Person[] };
      if (peopleRes.ok) setPeople(peopleData.people || []);
    }
  }, [canResetPassword]);

  useEffect(() => {
    void load().catch(() => setError("Could not load access requests."));
  }, [load]);

  const toggleFleet = (requestId: string, fleetId: string) => {
    setFleetsChosen((current) => {
      const selected = new Set(current[requestId] || []);
      if (selected.has(fleetId)) selected.delete(fleetId);
      else selected.add(fleetId);
      return { ...current, [requestId]: [...selected] };
    });
  };

  const decide = async (request: AccessRequest, action: "approve" | "deny") => {
    setBusy(request.id + action);
    setError("");
    const role = roles[request.id] || "driver";
    const fleetIds = fleetsChosen[request.id] || [];
    if (action === "approve" && fleetIds.length === 0) {
      setError("Choose at least one fleet.");
      setBusy("");
      return;
    }
    try {
      const res = await fetch(`/api/auth/access-requests/${request.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, role, fleetIds }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not update that request.");
        return;
      }
      await load();
    } catch {
      setError("Could not update that request.");
    } finally {
      setBusy("");
    }
  };

  const resetPassword = async (person: Person) => {
    setBusy(person.id);
    setError("");
    try {
      const res = await fetch("/api/auth/setup-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id }),
      });
      const data = (await res.json().catch(() => ({}))) as Issued & { error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Could not create a setup link.");
        return;
      }
      setIssued({
        url: data.url,
        qr: data.qr,
        expiresAt: data.expiresAt,
        label: `Password reset for ${person.name}`,
      });
    } catch {
      setError("Could not create a setup link.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">People and invites</h2>
        <p className="mt-1 text-sm text-muted">
          Approve a request, or reset a password with a one-time setup link.
        </p>
      </div>
      {error && (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
      <section className="space-y-3">
        <h3 className="font-bold text-ink">Waiting for approval</h3>
        {requests.length === 0 && (
          <p className="text-sm text-muted">No one is waiting for approval.</p>
        )}
        {requests.map((request) => {
          const role = roles[request.id] || "driver";
          const selected = new Set(fleetsChosen[request.id] || []);
          return (
            <article
              key={request.id}
              className="space-y-3 rounded-2xl border border-line bg-surface p-4"
            >
              <div>
                <p className="font-semibold text-ink">{request.name}</p>
                <p className="text-sm text-muted">{request.email}</p>
                {request.phone && <p className="text-sm text-muted">{request.phone}</p>}
              </div>
              <label className="block text-sm font-semibold text-ink" htmlFor={`role-${request.id}`}>
                Role
              </label>
              <select
                id={`role-${request.id}`}
                value={role}
                onChange={(event) =>
                  setRoles((current) => ({ ...current, [request.id]: event.target.value }))
                }
                className="min-h-[48px] w-full rounded-xl border border-line bg-canvas px-3 text-ink"
              >
                <option value="driver">Driver</option>
                <option value="office">Office</option>
                {canGrantOwner && <option value="owner">Owner</option>}
              </select>
              {!canGrantOwner && (
                <p className="text-xs text-muted">Only an owner can grant Owner.</p>
              )}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-ink">Fleets they can check</legend>
                {fleets.map((fleet) => (
                  <label key={fleet.id} className="flex min-h-[44px] items-center gap-3 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={selected.has(fleet.id)}
                      onChange={() => toggleFleet(request.id, fleet.id)}
                    />
                    {fleet.name}
                  </label>
                ))}
              </fieldset>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === request.id + "approve"}
                  onClick={() => void decide(request, "approve")}
                  className={`min-h-[48px] flex-1 rounded-xl font-bold ${primaryButtonClass}`}
                >
                  {busy === request.id + "approve" ? "Saving…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={busy === request.id + "deny"}
                  onClick={() => void decide(request, "deny")}
                  className={`min-h-[48px] flex-1 rounded-xl font-semibold ${secondaryOutlineButtonClass}`}
                >
                  {busy === request.id + "deny" ? "Saving…" : "Deny"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {canResetPassword && (
        <section className="space-y-3">
          <h3 className="font-bold text-ink">Reset a password</h3>
          <p className="text-sm text-muted">
            A reset sends a one-time setup link. It expires in 7 days and replaces any unused setup link.
          </p>
          {issued && (
            <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <p className="font-semibold text-ink">{issued.label}</p>
              <p className="text-xs text-muted">
                Expires {new Date(issued.expiresAt).toLocaleString()}. Copy it now. It is not shown again.
              </p>
              <input
                readOnly
                value={issued.url}
                aria-label="One-time setup link"
                className="min-h-[48px] w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink"
              />
              {issued.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={issued.qr}
                  alt="QR code for this one-time setup link"
                  width={180}
                  height={180}
                  className="h-[180px] w-[180px] rounded-xl bg-white"
                />
              )}
            </div>
          )}
          {people.map((person) => (
            <article
              key={person.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <div>
                <p className="font-semibold text-ink">{person.name}</p>
                <p className="text-sm text-muted">{person.email}</p>
                <p className="text-xs text-muted">{person.roleTitle || "No membership"}</p>
              </div>
              <button
                type="button"
                disabled={!person.active || busy === person.id}
                onClick={() => void resetPassword(person)}
                className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${secondaryOutlineButtonClass}`}
              >
                {busy === person.id ? "Creating…" : "Reset password"}
              </button>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
