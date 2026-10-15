import type { NextConfig } from "next";
import { PRIMARY_URL } from "./lib/site";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

// Old production addresses that should land on the primary domain.
const LEGACY_HOSTS = ["morse-electric.vercel.app", "morse-electric-jake-jacobsen-s-projects.vercel.app"];

const nextConfig: NextConfig = {
  async redirects() {
    return LEGACY_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `${PRIMARY_URL}/:path*`,
      permanent: true,
    }));
  },
  experimental: {
    // Admin photo uploads (3.5 MB) and CSV imports (1.5 MB, sent twice: preview then apply).
    // Vercel caps request bodies at 4.5 MB, so stay under that.
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: {
    // Product photos are served from Supabase Storage.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
