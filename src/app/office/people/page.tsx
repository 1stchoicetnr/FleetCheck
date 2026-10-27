"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OfficePinGate } from "@/components/office-pin-gate";
import { RolePicker } from "@/components/role-picker";
import { useAuth } from "@/hooks/use-auth";
import { fetchFleets, type SharedFleet } from "@/lib/checkout-api";
import { peopleForList } from "@/lib/people-list";
import { canManagePeople } from "@/lib/role-access";
import { setupLinkHandoff } from "@/lib/setup-link-copy";
import {
  dangerOutlineButtonClass,
  primaryButtonClass,
  secondaryOutlineButtonClass,
} from "@/lib/button-styles";

type Person = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: string;
  roleTitle: string;
  hasPassword: boolean;
  fleetIds: string[];
};

type Invite = {
  id: string;
  kind: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  role: string;
  roleTitle: string;
  expiresAt: string;
  revokedAt: string | null;
  usedAt: string | null;
};

type Issued = {
  url: string;
  qr: string;
  expiresAt: string;
  label: string;
  personId?: string;
  emailed?: boolean;
};

function reveal(node: HTMLElement | null) {
  node?.scrollIntoView({ block: "center" });
}

export default function PeoplePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const includeOwner = Boolean(
    user && (user.role === "super_admin" || user.roleTitle === "Owner")
  );
  const [ready, setReady] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fleets, setFleets] = useState<SharedFleet[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetError, setResetError] = useState<{ id: string; message: string } | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("driver");
  const [inviteFleets, setInviteFleets] = useState<string[]>([]);
  const [personRoles, setPersonRoles] = useState<Record<string, string>>({});
  const [personFleets, setPersonFleets] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Person | null>(null);
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canManagePeople(user)) router.replace("/dashboard");
  }, [user, loading, router]);

  const load = useCallback(async () => {
    const [res, fleetList] = await Promise.all([
      fetch("/api/auth/people", { cache: "no-store" }),
      fetchFleets().catch(() => [] as SharedFleet[]),
    ]);
    const data = (await res.json().catch(() => ({}))) as {
      people?: Person[];
      invites?: Invite[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Could not load people.");
      return;
    }
    const nextPeople = data.people || [];
    setPeople(nextPeople);
    setInvites(data.invites || []);
    setFleets(fleetList.filter((fleet) => !fleet.archivedAt));
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
    setError("");
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load().catch(() => setError("Could not load people."));
  }, [ready, load]);

  const issueSetup = async (person: Person) => {
    setBusy(person.id);
    setError("");
    setResetError(null);
    setIssued((current) => (current?.personId ? null : current));
    try {
      const res = await fetch("/api/auth/setup-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: person.id }),
      });
      const data = (await res.json().catch(() => ({}))) as Issued & { error?: string };
      if (!res.ok || !data.url) {
        setResetError({
          id: person.id,
          message: data.error || "Could not create a setup link.",
        });
        return;
      }
      setIssued({
        url: data.url,
        qr: data.qr,
        expiresAt: data.expiresAt,
        label: `Password reset for ${person.name}`,
        personId: person.id,
        emailed: Boolean(data.emailed),
      });
      await load();
    } catch {
      setResetError({ id: person.id, message: "Could not create a setup link." });
    } finally {
      setBusy("");
    }
  };

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    if (!includeOwner && inviteFleets.length < 1) {
      setError("Choose at least one fleet.");
      return;
    }
    setBusy("invite");
    setError("");
    try {
      const res = await fetch("/api/auth/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, fleetIds: inviteFleets }),
      });
      const data = (await res.json().catch(() => ({}))) as Issued & { error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Could not create that invite.");
        return;
      }
      setIssued({
        url: data.url,
        qr: data.qr,
        expiresAt: data.expiresAt,
        label: `Invite for ${name} (${email})`,
        emailed: Boolean(data.emailed),
      });
      setName("");
      setEmail("");
      setRole("driver");
      setInviteFleets([]);
      await load();
    } catch {
      setError("Could not create that invite.");
    } finally {
      setBusy("");
    }
  };

  const revoke = async (id: string) => {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/auth/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not revoke that link.");
        return;
      }
      await load();
    } catch {
      setError("Could not revoke that link.");
    } finally {
      setBusy("");
    }
  };

  const resend = async (inviteRow: Invite) => {
    setBusy(`${inviteRow.id}:resend`);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/auth/invites/${encodeURIComponent(inviteRow.id)}`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as Issued & { error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Could not resend that link.");
        return;
      }
      const who = inviteRow.name || inviteRow.email || "them";
      setIssued({
        url: data.url,
        qr: data.qr,
        expiresAt: data.expiresAt,
        label: `New link for ${who}`,
        emailed: Boolean(data.emailed),
      });
      setNotice("New link issued. The previous link no longer works.");
      await load();
    } catch {
      setError("Could not resend that link.");
    } finally {
      setBusy("");
    }
  };

  const toggleFleet = (
    current: string[],
    fleetId: string,
    apply: (next: string[]) => void
  ) => {
    const selected = new Set(current);
    if (selected.has(fleetId)) selected.delete(fleetId);
    else selected.add(fleetId);
    apply([...selected]);
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

  const deleteLogin = async () => {
    if (!pendingDelete) return;
    const person = pendingDelete;
    setBusy("delete");
    setError("");
    try {
      const res = await fetch(`/api/auth/people/${encodeURIComponent(person.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not delete that login.");
        return;
      }
      setPeople((current) => current.filter((item) => item.id !== person.id));
      setPendingDelete(null);
      setNotice("Login deleted.");
    } catch {
      setError("Could not delete that login.");
    } finally {
      setBusy("");
    }
  };

  if (loading || !user || !canManagePeople(user)) return null;
  const visiblePeople = peopleForList(people, showInactive);
  const inactiveCount = people.filter((person) => !person.active).length;
  const openInvites = invites.filter(
    (inviteRow) =>
      !inviteRow.usedAt &&
      !inviteRow.revokedAt &&
      new Date(inviteRow.expiresAt).getTime() > Date.now()
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="People" backHref="/office" />
      <OfficePinGate onUnlocked={markReady}>
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">People and invites</h2>
            <p className="mt-1 text-sm text-gray-600">
              Invite links and QR codes skip approval. They expire in 7 days, work once,
              and can be revoked. A manager can invite and approve people only on fleets
              they already have. Owner stays with an owner.
            </p>
          </div>

          {notice && (
            <p className="text-sm font-medium text-gray-900" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          )}

          {issued && !issued.personId && (
            <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="font-bold text-gray-900">{issued.label}</h3>
              <p className="text-xs text-gray-500">
                {setupLinkHandoff(Boolean(issued.emailed))}{" "}
                {new Date(issued.expiresAt).toLocaleString()}. Copy it now. It is not shown again.
              </p>
              <label htmlFor="issued-url" className="sr-only">
                Setup or invite link
              </label>
              <input
                id="issued-url"
                readOnly
                value={issued.url}
                className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900"
              />
              <button
                type="button"
                className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold ${primaryButtonClass}`}
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.url);
                }}
              >
                Copy link
              </button>
              {issued.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={issued.qr}
                  alt="QR code for this one-time link"
                  width={280}
                  height={280}
                  className="h-[180px] w-[180px] rounded-xl bg-white"
                />
              )}
            </section>
          )}

          <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
            <h3 className="font-bold text-gray-900">Invite someone</h3>
            <form onSubmit={invite} className="space-y-3">
              <div>
                <label htmlFor="invite-name" className="mb-1 block text-sm font-semibold text-gray-900">
                  Name
                </label>
                <input
                  id="invite-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-white px-3 text-gray-900"
                />
              </div>
              <div>
                <label htmlFor="invite-email" className="mb-1 block text-sm font-semibold text-gray-900">
                  Email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-white px-3 text-gray-900"
                />
              </div>
              <RolePicker id="invite-role" value={role} includeOwner={includeOwner} onChange={setRole} />
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-gray-900">Fleets</legend>
                {fleets.map((fleet) => (
                  <label key={fleet.id} className="flex min-h-[44px] items-center gap-3 text-sm text-gray-900">
                    <input
                      type="checkbox"
                      checked={inviteFleets.includes(fleet.id)}
                      onChange={() =>
                        toggleFleet(inviteFleets, fleet.id, setInviteFleets)
                      }
                    />
                    {fleet.name}
                  </label>
                ))}
              </fieldset>
              <button
                type="submit"
                disabled={busy === "invite"}
                className={`min-h-[48px] rounded-xl px-4 font-semibold ${primaryButtonClass}`}
              >
                {busy === "invite" ? "Creating…" : "Create invite link"}
              </button>
            </form>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-gray-900">People</h3>
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                />
                Show inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
              </label>
            </div>
            {visiblePeople.length === 0 ? (
              <p className="text-sm text-gray-600">No active people.</p>
            ) : null}
            {visiblePeople.map((person) => {
              const selected = personFleets[person.id] || person.fleetIds || [];
              const ownerPerson = person.role === "owner";
              return (
                <article
                  key={person.id}
                  className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{person.name}</p>
                    <p className="text-sm text-gray-600">{person.email}</p>
                    <p className="text-xs text-gray-500">
                      {person.roleTitle || "No membership"} ·{" "}
                      {person.active
                        ? person.hasPassword
                          ? "Password set"
                          : "No password yet"
                        : "Inactive"}
                    </p>
                  </div>
                  {!ownerPerson && (
                    <>
                      <RolePicker
                        id={`person-role-${person.id}`}
                        value={personRoles[person.id] || person.role || "driver"}
                        includeOwner={includeOwner}
                        onChange={(next) =>
                          setPersonRoles((current) => ({ ...current, [person.id]: next }))
                        }
                      />
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold text-gray-900">Fleets</legend>
                        {fleets.map((fleet) => (
                          <label
                            key={fleet.id}
                            className="flex min-h-[44px] items-center gap-3 text-sm text-gray-900"
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(fleet.id)}
                              onChange={() =>
                                toggleFleet(selected, fleet.id, (next) =>
                                  setPersonFleets((current) => ({ ...current, [person.id]: next }))
                                )
                              }
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
                    {includeOwner && person.id !== user.id ? (
                      <button
                        type="button"
                        disabled={busy === "delete"}
                        onClick={() => setPendingDelete(person)}
                        className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${dangerOutlineButtonClass}`}
                      >
                        Delete login
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={!person.active || busy === person.id || (ownerPerson && !includeOwner)}
                      onClick={() => void issueSetup(person)}
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
                    <div ref={reveal} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="font-semibold text-gray-900">{issued.label}</p>
                      <p className="text-xs text-gray-500">
                        {setupLinkHandoff(Boolean(issued.emailed))}{" "}
                        {new Date(issued.expiresAt).toLocaleString()}. Copy it now. It is not shown again.
                      </p>
                      <input
                        readOnly
                        value={issued.url}
                        aria-label="One-time setup link"
                        className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900"
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

          <section className="space-y-3">
            <h3 className="font-bold text-gray-900">Open links</h3>
            {openInvites.length === 0 && (
              <p className="text-sm text-gray-500">No open links.</p>
            )}
            {openInvites.map((inviteRow) => (
              <article
                key={inviteRow.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {inviteRow.kind === "setup" ? "Setup" : "Invite"} ·{" "}
                    {inviteRow.name || inviteRow.email || inviteRow.userId}
                  </p>
                  <p className="text-sm text-gray-600">
                    {inviteRow.roleTitle} · expires {new Date(inviteRow.expiresAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === `${inviteRow.id}:resend` || busy === inviteRow.id}
                    onClick={() => void resend(inviteRow)}
                    className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${secondaryOutlineButtonClass}`}
                  >
                    {busy === `${inviteRow.id}:resend` ? "Sending…" : "Resend"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === inviteRow.id || busy === `${inviteRow.id}:resend`}
                    onClick={() => void revoke(inviteRow.id)}
                    className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${dangerOutlineButtonClass}`}
                  >
                    Revoke
                  </button>
                </div>
              </article>
            ))}
          </section>
        </div>
      </OfficePinGate>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this login?"
        body={
          pendingDelete
            ? `${pendingDelete.name} will not be able to sign in. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete login"
        danger
        busy={busy === "delete"}
        onConfirm={() => void deleteLogin()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
