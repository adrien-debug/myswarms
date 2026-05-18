import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Connexion — MySwarms",
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
        background: "var(--ct-bg-deep)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "40px 36px",
          borderRadius: 16,
          background: "var(--ct-surface-1)",
          border: "1px solid var(--ct-border-strong)",
          backdropFilter: "blur(60px) saturate(110%) brightness(105%)",
          WebkitBackdropFilter: "blur(60px) saturate(110%) brightness(105%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 64px -24px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
        }}
      >
        {/* Logo / identité */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--ct-surface-3)",
            border: "1px solid var(--ct-border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
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
          style={{ marginBottom: 4, textAlign: "center" }}
        >
          MySwarms
        </p>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "var(--ct-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 6,
            textAlign: "center",
          }}
        >
          Connexion
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--ct-text-muted)",
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          Accès restreint — authentification requise.
        </p>

        <LoginForm returnTo={returnTo} />
      </div>
    </div>
  );
}
