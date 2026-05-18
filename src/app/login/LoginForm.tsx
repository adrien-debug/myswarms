"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Formulaire de connexion email/password Supabase.
 *
 * Note : la création de comptes se fait exclusivement via le dashboard Supabase
 * (https://app.supabase.com/project/fxeibmjebvxtoazuyyvz/auth/users).
 * MySwarms est single-user — aucune page signup publique.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Rafraîchir le Server Component pour que le middleware voie la session,
    // puis rediriger vers l'accueil.
    router.refresh();
    router.replace("/");
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 360 }}>
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "rgba(252,165,165,0.92)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="email"
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ct-text-muted)",
            marginBottom: 6,
          }}
        >
          Adresse e-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border-strong)",
            color: "var(--ct-text-primary)",
            fontSize: 14,
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color 180ms",
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = "var(--ct-accent)")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = "var(--ct-border-strong)")
          }
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label
          htmlFor="password"
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ct-text-muted)",
            marginBottom: 6,
          }}
        >
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border-strong)",
            color: "var(--ct-text-primary)",
            fontSize: 14,
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color 180ms",
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = "var(--ct-accent)")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = "var(--ct-border-strong)")
          }
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: "11px 20px",
          borderRadius: 8,
          background: loading
            ? "var(--ct-surface-3)"
            : "var(--ct-accent-strong)",
          border: "none",
          color: loading ? "var(--ct-text-muted)" : "#ffffff",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 180ms",
          letterSpacing: "0.02em",
        }}
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
