"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { OfficePinGate } from "@/components/office-pin-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { canManageFleet } from "@/lib/fleet-config";
import {
  AppUserRecord,
  createAppUser,
  fetchAppUsers,
  updateAppUser,
} from "@/lib/checkout-api";
import { ROLE_LABELS, UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["driver", "management", "tech", "super_admin"];

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("driver");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchAppUsers()
      .then((list) => {
        setUsers(list);
        setError("");
      })
      .catch((err: Error) => setError(err.message || "Could not load users."));
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canManageFleet(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const addUser = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createAppUser({ name, email, role });
      setName("");
      setEmail("");
      setRole("driver");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that user.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (record: AppUserRecord) => {
    setSaving(true);
    setError("");
    try {
      const saved = await updateAppUser(record.id, {
        name: record.name,
        email: record.email,
        role: record.role,
        active: record.active,
      });
      setUsers((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that user.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Users" backHref="/settings?section=people" />
      <OfficePinGate onUnlocked={() => setReady(true)}>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <p className="text-sm text-gray-600">
            Add people, change their role, or deactivate them. Deactivated users stay on file and cannot be chosen for new work.
          </p>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <Card>
            <CardContent className="py-4">
              <form onSubmit={addUser} className="space-y-3">
                <CardTitle className="text-base">Add user</CardTitle>
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-800 mb-1">Role</span>
                  <select
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm bg-white min-h-[48px]"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                  >
                    {ROLES.map((item) => (
                      <option key={item} value={item}>
                        {item === "management" ? "Office" : ROLE_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Saving…" : "Add user"}
                </Button>
              </form>
            </CardContent>
          </Card>
          {!ready ? (
            <p className="text-center text-brand-600 font-semibold">Loading users…</p>
          ) : (
            users.map((record) => (
              <Card key={record.id} className={record.active ? "" : "opacity-70"}>
                <CardContent className="py-4 space-y-2">
                  {editing === record.id ? (
                    <div className="space-y-2">
                      <Input
                        label="Name"
                        value={record.name}
                        onChange={(e) =>
                          setUsers((prev) =>
                            prev.map((item) =>
                              item.id === record.id ? { ...item, name: e.target.value } : item
                            )
                          )
                        }
                      />
                      <Input
                        label="Email"
                        value={record.email}
                        onChange={(e) =>
                          setUsers((prev) =>
                            prev.map((item) =>
                              item.id === record.id ? { ...item, email: e.target.value } : item
                            )
                          )
                        }
                      />
                      <select
                        className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm bg-white min-h-[48px]"
                        value={record.role}
                        onChange={(e) =>
                          setUsers((prev) =>
                            prev.map((item) =>
                              item.id === record.id
                                ? { ...item, role: e.target.value as UserRole }
                                : item
                            )
                          )
                        }
                      >
                        {ROLES.map((item) => (
                          <option key={item} value={item}>
                            {item === "management" ? "Office" : ROLE_LABELS[item]}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <Button type="button" className="flex-1" disabled={saving} onClick={() => saveEdit(record)}>
                          Save
                        </Button>
                        <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{record.name}</CardTitle>
                        <p className="text-sm text-gray-500">{record.email}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {record.role === "management" ? "Office" : ROLE_LABELS[record.role]}
                          {record.active ? "" : " · Deactivated"}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(record.id)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={record.active ? "danger" : "primary"}
                          disabled={saving}
                          onClick={() =>
                            saveEdit({ ...record, active: !record.active })
                          }
                        >
                          {record.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </OfficePinGate>
    </div>
  );
}
