import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
