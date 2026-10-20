"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { INSPEKT_ICON, INSPEKT_NAVY } from "@/lib/brand-mark";
import type { User } from "@/lib/types";

function homeFor(user: User): string {
  if (user.roleTitle === "Driver" || user.role === "driver") return "/checkout";
  if (user.roleTitle === "Owner" || user.roleTitle === "Office") return "/office";
  if (user.role === "super_admin" || user.role === "management" || user.role === "tech") {
    return "/office";
  }
  return "/dashboard";
}

export default function SignInPage() {
  const router = useRouter();
  const { adoptUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || "Email or password is wrong.");
        return;
      }
      adoptUser(data.user);
      router.replace(homeFor(data.user));
    } catch {
      setError("Could not sign in. Check the connection and try again.");
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
          <h1 className="text-3xl font-bold tracking-tight text-[#f7f7f8]">Inspekt</h1>
          <p className="mt-2 text-[#a1a1aa]">Sign in with your email</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-[#3a3a40] bg-[#1c1c1e] p-6"
        >
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-semibold text-[#f7f7f8]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-[#3a3a40] bg-[#101012] px-4 text-[#f7f7f8]"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-semibold text-[#f7f7f8]">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            className="min-h-[52px] w-full rounded-xl bg-[#22c55e] text-base font-bold text-[#052e16] disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#a1a1aa]">
          Need a password? Ask an owner for a one-time setup link.
        </p>
        <Link
          href="/"
          className="mt-4 flex min-h-[48px] items-center justify-center text-sm font-semibold text-sky-300"
        >
          Use the demo role buttons instead
        </Link>
      </div>
    </div>
  );
}
