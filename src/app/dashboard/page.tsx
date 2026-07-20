"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  Car,
  ClipboardList,
  Settings,
  BarChart3,
  Wrench,
  Plus,
  FileText,
  Bell,
} from "lucide-react";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-brand-600 font-semibold">Loading...</div>
      </div>
    );
  }

  const role = user.role;

  const driverLinks = [
    {
      href: "/check-in",
      icon: <Car className="h-7 w-7" />,
      label: "Check In / Out",
      desc: "Start or end your shift",
      color: "bg-green-100 text-green-700",
    },
    {
      href: "/vehicles",
      icon: <ClipboardList className="h-7 w-7" />,
      label: "My Vehicles",
      desc: "View assigned vehicles",
      color: "bg-blue-100 text-blue-700",
    },
  ];

  const techLinks = [
    {
      href: "/vehicles",
      icon: <Wrench className="h-7 w-7" />,
      label: "Maintenance",
      desc: "Update vehicle status",
      color: "bg-orange-100 text-orange-700",
    },
    {
      href: "/reports",
      icon: <FileText className="h-7 w-7" />,
      label: "Issue Reports",
      desc: "View reported problems",
      color: "bg-red-100 text-red-700",
    },
  ];

  const managementLinks = [
    {
      href: "/reports",
      icon: <BarChart3 className="h-7 w-7" />,
      label: "Reports",
      desc: "View all check records",
      color: "bg-blue-100 text-blue-700",
    },
    {
      href: "/vehicles",
      icon: <ClipboardList className="h-7 w-7" />,
      label: "Fleet Overview",
      desc: "All vehicles & status",
      color: "bg-green-100 text-green-700",
    },
    {
      href: "/alerts",
      icon: <Bell className="h-7 w-7" />,
      label: "Alerts",
      desc: "Maintenance & condition alerts",
      color: "bg-yellow-100 text-yellow-700",
    },
  ];

  const adminLinks = [
    ...managementLinks,
    {
      href: "/admin",
      icon: <Settings className="h-7 w-7" />,
      label: "Admin Panel",
      desc: "Manage fleets, users & settings",
      color: "bg-purple-100 text-purple-700",
    },
    {
      href: "/admin/vehicles/new",
      icon: <Plus className="h-7 w-7" />,
      label: "Add Vehicle",
      desc: "Register a new vehicle",
      color: "bg-brand-100 text-brand-700",
    },
  ];

  let links = driverLinks;
  if (role === "tech") links = techLinks;
  else if (role === "management") links = managementLinks;
  else if (role === "super_admin") links = adminLinks;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Dashboard" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-gray-900">
            Hello, {user.name}
          </h2>
          <p className="text-gray-500 text-sm">What would you like to do?</p>
        </div>

        <div className="grid gap-3">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="hover:shadow-md transition-shadow active:scale-[0.98]">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className={`rounded-xl p-3 ${link.color}`}>
                    {link.icon}
                  </div>
                  <div>
                    <CardTitle className="text-base">{link.label}</CardTitle>
                    <p className="text-sm text-gray-500">{link.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
