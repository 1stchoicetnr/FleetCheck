"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFleets, type SharedFleet } from "@/lib/checkout-api";
import { primaryButtonClass, secondaryOutlineButtonClass } from "@/lib/button-styles";
import { RolePicker } from "@/components/role-picker";

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
  role: string;
  roleTitle: string;
  fleetIds: string[];
};

type Issued = {
  personId: string;
  url: string;
  qr: string;
  expiresAt: string;
  label: string;
};

function reveal(node: HTMLElement | null) {
  node?.scrollIntoView({ block: "center" });
}

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
  const [personRoles, setPersonRoles] = useState<Record<string, string>>({});
  const [personFleets, setPersonFleets] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [resetError, setResetError] = useState<{ id: string; message: string } | null>(null);
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
      if (peopleRes.ok) {
        const nextPeople = peopleData.people || [];
        setPeople(nextPeople);
        setPersonRoles((current) => {
          const next = { ...current };
          for (const person of nextPeople) {
            if (!next[person.id]) next[person.id] = person.role || "driver";
          }
          return next;
        });
        setPersonFleets((current) => {
          const next = { ...current };
          for (const person of nextPeople) {
            if (!next[person.id]) next[person.id] = person.fleetIds || [];
          }
          return next;
        });
      }
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

  const togglePersonFleet = (personId: string, fleetId: string) => {
    setPersonFleets((current) => {
      const selected = new Set(current[personId] || []);
      if (selected.has(fleetId)) selected.delete(fleetId);
      else selected.add(fleetId);
      return { ...current, [personId]: [...selected] };
    });
  };

  const savePerson = async (person: Person) => {
    const fleetIds = personFleets[person.id] || person.fleetIds || [];
    if (fleetIds.length < 1 && (person.fleetIds || []).length > 0) {
      setError("Choose at least one fleet.");
      return;
    }
    setBusy(person.id + "save");
    setError("");
    try {
      const res = await fetch(`/api/auth/people/${encodeURIComponent(person.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          fleetIds.length
            ? { role: personRoles[person.id] || person.role || "driver", fleetIds }
            : { role: personRoles[person.id] || person.role || "driver" }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not update that person.");
        return;
      }
      await load();
    } catch {
      setError("Could not update that person.");
    } finally {
      setBusy("");
    }
  };

  const setActive = async (person: Person, active: boolean) => {
    setBusy(person.id + "active");
    setError("");
    try {
      const res = await fetch(`/api/auth/people/${encodeURIComponent(person.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not update that person.");
        return;
      }
      await load();
    } catch {
      setError("Could not update that person.");
    } finally {
      setBusy("");
    }
  };

  const resetPassword = async (person: Person) => {
    setBusy(person.id);
    setError("");
    setResetError(null);
    setIssued(null);
    try {
      const res = await fetch("/api/auth/setup-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        qr?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setResetError({
          id: person.id,
          message: data.error || "Could not create a setup link.",
        });
        return;
      }
      setIssued({
        personId: person.id,
        url: data.url,
        qr: data.qr || "",
        expiresAt: data.expiresAt || "",
        label: `Password reset for ${person.name}`,
      });
    } catch {
      setResetError({ id: person.id, message: "Could not create a setup link." });
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
              <RolePicker
                id={`role-${request.id}`}
                value={role}
                includeOwner={canGrantOwner}
                onChange={(next) => setRoles((current) => ({ ...current, [request.id]: next }))}
              />
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
            A reset creates a one-time setup link the admin must pass on. It expires in 7 days and replaces any unused setup link.
          </p>
          {people.map((person) => {
            const selected = new Set(personFleets[person.id] || person.fleetIds || []);
            const ownerPerson = person.role === "owner";
            return (
            <article
              key={person.id}
              className="space-y-3 rounded-2xl border border-line bg-surface p-4"
            >
              <div>
                <p className="font-semibold text-ink">{person.name}</p>
                <p className="text-sm text-muted">{person.email}</p>
                <p className="text-xs text-muted">
                  {person.roleTitle || "No membership"} · {person.active ? "Active" : "Inactive"}
                </p>
              </div>
              {!ownerPerson && (
                <>
                  <RolePicker
                    id={`person-role-${person.id}`}
                    value={personRoles[person.id] || person.role || "driver"}
                    includeOwner={canGrantOwner}
                    onChange={(next) =>
                      setPersonRoles((current) => ({ ...current, [person.id]: next }))
                    }
                  />
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold text-ink">Fleets</legend>
                    {fleets.map((fleet) => (
                      <label key={fleet.id} className="flex min-h-[44px] items-center gap-3 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={selected.has(fleet.id)}
                          onChange={() => togglePersonFleet(person.id, fleet.id)}
                        />
                        {fleet.name}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {!ownerPerson && (
                  <button
                    type="button"
                    disabled={busy === person.id + "save"}
                    onClick={() => void savePerson(person)}
                    className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${primaryButtonClass}`}
                  >
                    {busy === person.id + "save" ? "Saving…" : "Save access"}
                  </button>
                )}
                {!ownerPerson && (
                  <button
                    type="button"
                    disabled={busy === person.id + "active"}
                    onClick={() => void setActive(person, !person.active)}
                    className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${secondaryOutlineButtonClass}`}
                  >
                    {person.active ? "Deactivate" : "Reactivate"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!person.active || busy === person.id || (ownerPerson && !canGrantOwner)}
                  onClick={() => void resetPassword(person)}
                  className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${secondaryOutlineButtonClass}`}
                >
                  {busy === person.id ? "Creating…" : "Reset password"}
                </button>
              </div>
              {resetError?.id === person.id && (
                <p
                  ref={reveal}
                  className="rounded-xl border border-[#fca5a5] bg-[#1c1c1e] px-3 py-2 text-sm font-semibold text-[#fecaca]"
                  role="alert"
                >
                  {resetError.message}
                </p>
              )}
              {issued?.personId === person.id && (
                <div ref={reveal} className="space-y-2 rounded-xl border border-line bg-canvas p-3">
                  <p className="font-semibold text-ink">{issued.label}</p>
                  <p className="text-xs text-muted">
                    Pass this link on. It is not emailed. Expires{" "}
                    {issued.expiresAt ? new Date(issued.expiresAt).toLocaleString() : "in 7 days"}.
                    Copy it now. It is not shown again.
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
            </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
