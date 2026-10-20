import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Allow phone on LAN to load dev assets
  allowedDevOrigins: ["192.168.1.217"],
  turbopack: {
    root: path.join(__dirname),
  },
  redirects: async () => [
    { source: "/check-in", destination: "/checkout", permanent: false },
    { source: "/check-in/:path*", destination: "/checkout", permanent: false },
    { source: "/office/settings", destination: "/settings?section=company", permanent: false },
    { source: "/alerts/settings", destination: "/settings?section=notifications", permanent: false },
    { source: "/admin", destination: "/settings?section=people", permanent: false },
    { source: "/office/units", destination: "/vehicles", permanent: false },
  ],
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
  ],
};

export default nextConfig;
