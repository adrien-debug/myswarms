import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    // Autorise toujours l'embed depuis le hub Hearst Cockpit (localhost:4200/4201).
    // Ces origines locales ne peuvent jamais être servies en prod → aucun risque.
    const frameAncestors =
      "frame-ancestors 'self' http://localhost:4200 http://localhost:4201";

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://*.sentry.io`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss:",
              "worker-src 'self' blob:",
              frameAncestors,
              "base-uri 'self'",
              "form-action 'self'",
            ]
              .filter(Boolean)
              .join("; "),
          },
          // Pas de X-Frame-Options : il bloque toute embed cross-origin et ne
          // supporte pas de whitelist. Le CSP frame-ancestors ci-dessus suffit.
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // -----------------------------------------------------------------------
  // Sentry build-time options
  // -----------------------------------------------------------------------

  // Silent Sentry CLI output unless there is an error.
  silent: !process.env.CI,

  // Disable the automatic Sentry release creation.
  release: {
    create: false,
    finalize: false,
  },

  // Disable automatic instrumentation helpers injection — we use our own
  // instrumentation.ts / instrumentation-client.ts files (Next 16 convention).
  // Using nested webpack.* keys (new API) to avoid deprecation warnings.
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
  },
});
