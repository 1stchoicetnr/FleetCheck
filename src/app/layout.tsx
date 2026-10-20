import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/hooks/use-auth";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { OrientationUnlock } from "@/components/orientation-unlock";
import { OfflineBanner } from "@/components/offline-banner";
import { appleStartupImages } from "@/lib/apple-startup-images";
import { INSPEKT_NAVY } from "@/lib/brand-mark";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});
export const metadata: Metadata = {
  title: "Inspekt",
  description: "Vehicle documentation, damage tracking, and accountability",
  applicationName: "Inspekt",
  manifest: "/manifest.json?v=3",
  icons: {
    icon: [
      { url: "/favicon.ico?v=3" },
      { url: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Inspekt",
    startupImage: appleStartupImages,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: INSPEKT_NAVY,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen`}>
        <AuthProvider>
          <ServiceWorkerRegister />
          <OrientationUnlock />
          <OfflineBanner />
          <main className="min-h-screen safe-bottom">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
