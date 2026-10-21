"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { OfficePinGate } from "@/components/office-pin-gate";
import { useAuth } from "@/hooks/use-auth";
import { canManageFleet, canReviewCheckout } from "@/lib/fleet-config";
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
};

export default function PeoplePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("driver");
  const [busy, setBusy] = useState("");
  const markReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/people", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      people?: Person[];
      invites?: Invite[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Could not load people.");
      return;
    }
    setPeople(data.people || []);
    setInvites(data.invites || []);
    setError("");
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load().catch(() => setError("Could not load people."));
  }, [ready, load]);

  const issueSetup = async (person: Person) => {
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
        label: `Password reset for ${person.name} (${person.email})`,
      });
      await load();
    } catch {
      setError("Could not create a setup link.");
    } finally {
      setBusy("");
    }
  };

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("invite");
    setError("");
    try {
      const res = await fetch("/api/auth/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
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
      });
      setName("");
      setEmail("");
      setRole("driver");
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

  if (loading || !user) return null;
  const owner = canManageFleet(user.role) || user.roleTitle === "Owner";
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
              and can be revoked. Reset password sends a one-time setup link. The office
              PIN stays on the sign-in page until an owner sets a password.
            </p>
          </div>

          {error && (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          )}

          {!owner && (
            <p className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
              Only an owner can invite people.
            </p>
          )}

          {owner && issued && (
            <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="font-bold text-gray-900">{issued.label}</h3>
              <p className="text-xs text-gray-500">
                Expires {new Date(issued.expiresAt).toLocaleString()}. Copy it now. It is not shown again.
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

          {owner && (
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
                <div>
                  <label htmlFor="invite-role" className="mb-1 block text-sm font-semibold text-gray-900">
                    Role
                  </label>
                  <select
                    id="invite-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-white px-3 text-gray-900"
                  >
                    <option value="driver">Driver</option>
                    <option value="office">Office</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={busy === "invite"}
                  className={`min-h-[48px] rounded-xl px-4 font-semibold ${primaryButtonClass}`}
                >
                  {busy === "invite" ? "Creating…" : "Create invite link"}
                </button>
              </form>
            </section>
          )}

          {owner && (
            <section className="space-y-3">
              <h3 className="font-bold text-gray-900">People</h3>
              {people.map((person) => (
                <article
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4"
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
                  <button
                    type="button"
                    disabled={!person.active || busy === person.id}
                    onClick={() => void issueSetup(person)}
                    className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${secondaryOutlineButtonClass}`}
                  >
                    {busy === person.id ? "Creating…" : "Reset password"}
                  </button>
                </article>
              ))}
            </section>
          )}

          {owner && (
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
                  <button
                    type="button"
                    disabled={busy === inviteRow.id}
                    onClick={() => void revoke(inviteRow.id)}
                    className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${dangerOutlineButtonClass}`}
                  >
                    Revoke
                  </button>
                </article>
              ))}
            </section>
          )}
        </div>
      </OfficePinGate>
    </div>
  );
}
