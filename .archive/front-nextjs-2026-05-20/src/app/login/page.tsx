import { LoginForm } from "./LoginForm";
import {
  SPACING,
  RADIUS,
  FONT,
  BLUR,
  SIZE,
} from "@/lib/ui/tokens";

export const metadata = {
  title: "Sign in — MySwarms",
};

/**
 * Page de connexion Supabase email/password.
 *
 * Note : pas de page signup — les comptes sont créés via le dashboard Supabase
 * (https://app.supabase.com/project/fxeibmjebvxtoazuyyvz/auth/users).
 * MySwarms est mono-utilisateur, accès restreint.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params?.returnTo ?? "/";
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ct-overlay-modal)",
        backdropFilter: BLUR.modal,
        WebkitBackdropFilter: BLUR.modal,
        padding: SPACING.xl,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: `${SPACING.xxl + SPACING.sm}px ${SPACING.xxl + SPACING.xs}px`,
          borderRadius: RADIUS.xl,
          background: "var(--ct-surface-1)",
          border: "1px solid var(--ct-border-strong)",
          backdropFilter: BLUR.panel,
          WebkitBackdropFilter: BLUR.panel,
          boxShadow: "var(--ct-shadow-depth)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Logo / identité */}
        <div
          style={{
            width: SIZE.logoLg,
            height: SIZE.logoLg,
            borderRadius: RADIUS.lg,
            background: "var(--ct-surface-3)",
            border: "1px solid var(--ct-border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: SPACING.xl,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--ct-accent-strong)",
            }}
          />
        </div>

        <p
          className="ct-eyebrow"
          style={{ marginBottom: SPACING.xs, textAlign: "center" }}
        >
          MySwarms
        </p>
        <h1
          className="ct-title"
          style={{
            fontSize: FONT.display,
            marginBottom: SPACING.xxs,
            textAlign: "center",
          }}
        >
          Sign in
        </h1>
        <p
          className="ct-sub"
          style={{ textAlign: "center" }}
        >
          Restricted access — authentication required.
        </p>

        <LoginForm returnTo={returnTo} />
      </div>
    </div>
  );
}
