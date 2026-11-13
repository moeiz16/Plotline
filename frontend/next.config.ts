import type { NextConfig } from "next";

const API_ORIGIN = process.env.PLOTLINE_API_ORIGIN || "http://localhost:8010";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation stays available to this site only, so suppliers can drop a pin where they stand.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Same-origin API: httpOnly session cookies and the CSRF double-submit cookie just work.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  async headers() {
    // Proxied API responses keep the service's own headers (it allows evidence packs to be framed by this site).
    return [{ source: "/((?!api/).*)", headers: securityHeaders }];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
