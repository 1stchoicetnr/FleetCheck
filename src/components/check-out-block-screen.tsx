"use client";

import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

interface CheckOutBlockScreenProps {
  title?: string;
  message: string;
  backHref?: string;
}

export function CheckOutBlockScreen({
  title = "Check Out Blocked",
  message,
  backHref = "/check-in",
}: CheckOutBlockScreenProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title={title} backHref={backHref} />
      <div className="max-w-lg mx-auto px-4 py-10 text-center space-y-6">
        <div className="bg-red-100 rounded-full p-6 inline-flex">
          <AlertTriangle className="h-12 w-12 text-red-600" />
        </div>
        <p className="text-lg font-semibold text-gray-900">{message}</p>
        <Button size="lg" className="w-full" onClick={() => router.push(backHref)}>
          Go Back
        </Button>
      </div>
    </div>
  );
}
