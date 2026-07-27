import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/hooks/use-auth";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { OfflineBanner } from "@/components/offline-banner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});
export const metadata: Metadata = {
  title: "FleetCheck",
  description: "Vehicle documentation, damage tracking, and accountability",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FleetCheck",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
      </head>
      <body className={`${inter.className} min-h-screen`}>        <AuthProvider>
          <ServiceWorkerRegister />
          <OfflineBanner />
          <main className="min-h-screen safe-bottom">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
