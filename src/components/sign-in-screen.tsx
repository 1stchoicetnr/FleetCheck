"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { INSPEKT_ICON, INSPEKT_NAVY } from "@/lib/brand-mark";
import type { User } from "@/lib/types";
import { primaryButtonClass, secondaryOutlineButtonClass } from "@/lib/button-styles";

type Screen = "sign-in" | "request" | "waiting" | "denied";

function homeFor(user: User): string {
  if (user.roleTitle === "Driver" || user.role === "driver") return "/checkout";
  if (
    user.roleTitle === "Owner" ||
    user.roleTitle === "Manager" ||
    user.roleTitle === "Office"
  ) {
    return "/dashboard";
  }
  if (user.role === "super_admin" || user.role === "management" || user.role === "tech") {
    return "/dashboard";
  }
  return "/dashboard";
}

const SAFE_RETURN =
  /^\/(?:checkout(?:\/[A-Za-z0-9_-]+)?|office\/[A-Za-z0-9_-]+\/photos)$/;

function afterSignIn(user: User): string {
  if (typeof window === "undefined") return homeFor(user);
  const next = new URLSearchParams(window.location.search).get("next");
  return next && SAFE_RETURN.test(next) ? next : homeFor(user);
}

export function SignInScreen() {
  const router = useRouter();
  const { user, loading, adoptUser } = useAuth();
  const [screen, setScreen] = useState<Screen>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pinFallback, setPinFallback] = useState(false);
  const [showOwnerSetup, setShowOwnerSetup] = useState(false);
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace(afterSignIn(user));
  }, [loading, user, router]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/owner-setup", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { pinFallback?: boolean };
        if (!cancelled && res.ok && data.pinFallback) setPinFallback(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: User;
        status?: string;
        error?: string;
      };
      if (data.status === "pending") {
        setScreen("waiting");
        return;
      }
      if (data.status === "denied") {
        setScreen("denied");
        return;
      }
      if (!res.ok || !data.user) {
        setError(data.error || "Email or password is wrong.");
        return;
      }
      adoptUser(data.user);
      router.replace(afterSignIn(data.user));
    } catch {
      setError("Could not sign in. Check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const requestAccess = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (data.status === "pending") {
        setScreen("waiting");
        return;
      }
      if (data.status === "denied") {
        setScreen("denied");
        return;
      }
      if (data.status === "exists") {
        setError("That email already has an account. Sign in instead.");
        return;
      }
      setError(data.error || "Could not request access.");
    } catch {
      setError("Could not request access. Check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const ownerSetup = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/owner-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Could not open owner setup.");
        return;
      }
      adoptUser(data.user);
      router.replace("/dashboard");
    } catch {
      setError("Could not open owner setup. Check the connection and try again.");
    } finally {
      setSubmitting(false);
      setPin("");
    }
  };

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: INSPEKT_NAVY }}>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <Image
            src={INSPEKT_ICON}
            unoptimized
            alt=""
            width={72}
            height={72}
            priority
            className="mx-auto mb-4 h-[72px] w-[72px]"
          />
          <h1 className="text-3xl font-bold tracking-tight text-[#f7f7f8]">Inspekt</h1>
          <p className="mt-2 text-[#a1a1aa]">
            {screen === "waiting"
              ? "Waiting for approval"
              : screen === "denied"
                ? "Access was not approved"
                : screen === "request"
                  ? "Request access"
                  : "Sign in with your email"}
          </p>
        </div>

        {screen === "waiting" && (
          <section className="space-y-4 rounded-2xl border border-[#3a3a40] bg-[#1c1c1e] p-6 text-[#f7f7f8]">
            <h2 className="text-xl font-bold">Waiting for approval</h2>
            <p className="text-sm text-[#a1a1aa]">
              Your request is in. An owner or the office will choose your role and fleets.
              You can sign in again after you are approved.
            </p>
            <button
              type="button"
              className="min-h-[48px] text-sm font-semibold text-sky-300"
              onClick={() => {
                setScreen("sign-in");
                setError("");
              }}
            >
              Back to sign in
            </button>
          </section>
        )}

        {screen === "denied" && (
          <section className="space-y-4 rounded-2xl border border-[#3a3a40] bg-[#1c1c1e] p-6 text-[#f7f7f8]">
            <h2 className="text-xl font-bold">Access was not approved</h2>
            <p className="text-sm text-[#a1a1aa]">
              This email was not approved. Ask an owner if you think this is a mistake.
            </p>
            <button
              type="button"
              className="min-h-[48px] text-sm font-semibold text-sky-300"
              onClick={() => {
                setScreen("sign-in");
                setError("");
              }}
            >
              Back to sign in
            </button>
          </section>
        )}

        {screen === "request" && (
          <form
            onSubmit={requestAccess}
            className="space-y-4 rounded-2xl border border-[#3a3a40] bg-[#1c1c1e] p-6"
          >
            <Field id="request-name" label="Name" value={name} onChange={setName} autoComplete="name" />
            <Field
              id="request-email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <Field
              id="request-phone"
              label="Phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              autoComplete="tel"
            />
            <Field
              id="request-password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            {error && <Alert text={error} />}
            <button
              type="submit"
              disabled={submitting}
              className={`min-h-[52px] w-full rounded-xl text-base font-bold ${primaryButtonClass}`}
            >
              {submitting ? "Sending…" : "Request access"}
            </button>
            <button
              type="button"
              className="min-h-[44px] w-full text-sm font-semibold text-sky-300"
              onClick={() => {
                setScreen("sign-in");
                setError("");
              }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {screen === "sign-in" && (
          <form
            onSubmit={signIn}
            className="space-y-4 rounded-2xl border border-[#3a3a40] bg-[#1c1c1e] p-6"
          >
            <Field
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="username"
            />
            <Field
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
            {error && <Alert text={error} />}
            <button
              type="submit"
              disabled={submitting}
              className={`min-h-[52px] w-full rounded-xl text-base font-bold ${primaryButtonClass}`}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {screen === "sign-in" && (
          <div className="mt-6 space-y-3 text-center">
            <button
              type="button"
              className="min-h-[44px] text-sm font-semibold text-sky-300"
              onClick={() => {
                setScreen("request");
                setError("");
              }}
            >
              Request access
            </button>
            {pinFallback && (
              <div>
                <button
                  type="button"
                  className="text-sm text-[#a1a1aa] underline"
                  onClick={() => {
                    setShowOwnerSetup((open) => !open);
                    setError("");
                  }}
                >
                  Owner setup
                </button>
                {showOwnerSetup && (
                  <form onSubmit={ownerSetup} className="mt-3 space-y-3 text-left">
                    <label htmlFor="owner-pin" className="block text-sm font-semibold text-[#f7f7f8]">
                      Office PIN
                    </label>
                    <input
                      id="owner-pin"
                      name="owner-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pin}
                      onChange={(event) => setPin(event.target.value)}
                      className="min-h-[48px] w-full rounded-xl border border-[#3a3a40] bg-[#101012] px-4 text-[#f7f7f8]"
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className={`min-h-[48px] w-full rounded-xl text-sm font-semibold ${secondaryOutlineButtonClass}`}
                    >
                      {submitting ? "Checking…" : "Continue"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-[#f7f7f8]">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[48px] w-full rounded-xl border border-[#3a3a40] bg-[#101012] px-4 text-[#f7f7f8]"
      />
    </div>
  );
}

function Alert({ text }: { text: string }) {
  return (
    <p className="text-sm font-medium text-red-300" role="alert">
      {text}
    </p>
  );
}
