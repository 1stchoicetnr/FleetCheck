"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { INSPEKT_ICON, INSPEKT_NAVY } from "@/lib/brand-mark";
import type { User } from "@/lib/types";
import { primaryButtonClass } from "@/lib/button-styles";

type Preview = {
  kind: string;
  name: string | null;
  email: string | null;
  roleTitle: string;
};

function homeFor(user: User): string {
  if (user.roleTitle === "Driver" || user.role === "driver") return "/checkout";
  if (
    user.roleTitle === "Owner" ||
    user.roleTitle === "Manager" ||
    user.roleTitle === "Office"
  ) {
    return "/office";
  }
  return "/dashboard";
}

export default function SetupPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { adoptUser } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/auth/setup/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as Preview & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(data.error || "This link has expired or was already used.");
        return;
      }
      setPreview(data);
    }
    void load().catch(() => {
      if (!cancelled) setLoadError("Could not open this link.");
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/setup/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Could not save that password.");
        return;
      }
      adoptUser(data.user);
      router.replace(homeFor(data.user));
    } catch {
      setError("Could not save that password. Check the connection and try again.");
    } finally {
      setSubmitting(false);
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
          <h1 className="text-3xl font-bold tracking-tight text-[#f7f7f8]">Set your password</h1>
          <p className="mt-2 text-[#a1a1aa]">This link works once.</p>
        </div>

        {loadError && (
          <div className="rounded-2xl border border-[#3a3a40] bg-[#1c1c1e] p-6 text-center">
            <p className="text-[#f7f7f8]" role="alert">
              {loadError}
            </p>
            <Link href="/sign-in" className="mt-4 inline-flex min-h-[44px] items-center font-semibold text-sky-300">
              Back to sign in
            </Link>
          </div>
        )}

        {!loadError && !preview && (
          <p className="text-center text-[#a1a1aa]">Loading…</p>
        )}

        {preview && (
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-2xl border border-[#3a3a40] bg-[#1c1c1e] p-6"
          >
            <p className="text-sm text-[#a1a1aa]">
              {preview.name || "New person"}
              {preview.email ? ` · ${preview.email}` : ""} · {preview.roleTitle}
            </p>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-[#f7f7f8]">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[#3a3a40] bg-[#101012] px-4 text-[#f7f7f8]"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm" className="block text-sm font-semibold text-[#f7f7f8]">
                Confirm password
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[#3a3a40] bg-[#101012] px-4 text-[#f7f7f8]"
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-red-300" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className={`min-h-[52px] w-full rounded-xl text-base font-bold ${primaryButtonClass}`}
            >
              {submitting ? "Saving…" : "Save password and sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
