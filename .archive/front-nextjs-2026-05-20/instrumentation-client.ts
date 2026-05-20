import * as Sentry from "@sentry/nextjs";

// Sentry browser-side init.
// Fail-soft: if NEXT_PUBLIC_SENTRY_DSN is absent, skip init — no crash.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // Capture 10 % of traces in production, 100 % in dev.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Replay 1 % of sessions in production, none in dev.
    replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.01 : 0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 0.5 : 0,
    sendDefaultPii: false,
    integrations: [Sentry.replayIntegration()],
  });
}

// Required by @sentry/nextjs to instrument client-side navigations in Next 16.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
