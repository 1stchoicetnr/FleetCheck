"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getUsers } from "@/lib/storage";
import { User, ROLE_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Shield, Wrench, Car } from "lucide-react";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  super_admin: <Shield className="h-6 w-6" />,
  management: <Truck className="h-6 w-6" />,
  tech: <Wrench className="h-6 w-6" />,
  driver: <Car className="h-6 w-6" />,
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700",
  management: "bg-blue-100 text-blue-700",
  tech: "bg-orange-100 text-orange-700",
  driver: "bg-green-100 text-green-700",
};

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-brand-600 font-semibold">
          Loading FleetCheck...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-brand-600 text-white px-6 py-12 text-center">
        <div className="inline-flex bg-white/20 rounded-2xl p-4 mb-4">
          <Truck className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-bold">FleetCheck</h1>
        <p className="text-brand-100 mt-2 text-sm">
          Vehicle docs, damage tracking & accountability
        </p>
      </div>

      <div className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Select your role to continue
        </h2>
        <div className="space-y-3">
          {users.map((u) => (
            <Card
              key={u.id}
              className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
            >
              <CardContent className="p-0">
                <button
                  onClick={() => login(u.id)}
                  className="w-full flex items-center gap-4 p-4 text-left"
                >
                  <div
                    className={`rounded-xl p-3 ${ROLE_COLORS[u.role]}`}
                  >
                    {ROLE_ICONS[u.role]}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{u.name}</p>
                    <p className="text-sm text-gray-500">
                      {ROLE_LABELS[u.role]}
                    </p>
                  </div>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">
          Demo mode — select any user to explore FleetCheck
        </p>
      </div>
    </div>
  );
}
