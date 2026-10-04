import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. Next.js injects inline bootstrap scripts, so 'unsafe-inline' is needed for scripts
// until a nonce-based policy is introduced (tracked in docs/DECISIONS.md D-22). 'unsafe-eval' is dev-only.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}https://checkout.razorpay.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://apis.google.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com http://127.0.0.1:9199 http://localhost:9199",
  "font-src 'self' data:",
  `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://api.razorpay.com https://lumberjack.razorpay.com${isDev ? " http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*" : ""}`,
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["firebase-admin", "sharp", "exceljs"],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "http", hostname: "127.0.0.1", port: "9199" },
      { protocol: "http", hostname: "localhost", port: "9199" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
