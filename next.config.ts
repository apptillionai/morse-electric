import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
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
