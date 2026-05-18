"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SPACING } from "@/lib/ui/tokens";

interface Tip {
  title: string;
  body: string;
}

const TIPS_BY_AREA: Record<string, Tip[]> = {
  home: [
    {
      title: "Démarre vite",
      body: "Crée ton premier swarm depuis l'onglet Swarms.",
    },
    {
      title: "Templates",
      body: "Les swarms marqués `template` peuvent servir de base.",
    },
  ],
  swarms: [
    {
      title: "Anatomie",
      body: "Un swarm = N agents + M tâches + tools optionnels.",
    },
    {
      title: "Rôles",
      body: "coordinator/analyst/executor/reviewer/tool_runner — choisis selon la responsabilité.",
    },
    {
      title: "Tools",
      body: "Lie des tools (API, files, search…) à un ou plusieurs agents.",
    },
  ],
  builder: [
    {
      title: "Tabs",
      body: "Overview → Agents → Tasks → Tools → Preview. Tu peux switcher sans perdre l'état.",
    },
    {
      title: "Modèles LLM",
      body: "Anthropic (default), OpenAI, ou Hypercli/Kimi. Temperature 0.7 conseillée.",
    },
  ],
  run: [
    {
      title: "Auto-refresh",
      body: "La page se rafraîchit toutes les 5s tant que le run est `running`.",
    },
    {
      title: "Timeline",
      body: "Chaque step affiche tokens, cost et latence. Cliquable pour le détail.",
    },
  ],
  crews: [
    {
      title: "Brief du matin",
      body: "Le scheduler tourne à 8h et 18h30. Tu peux aussi déclencher manuellement depuis la page Chief of Staff.",
    },
    {
      title: "Digest Telegram",
      body: "Après chaque run schedulé, le résumé arrive automatiquement sur ton Telegram.",
    },
  ],
};

function pickArea(pathname: string): keyof typeof TIPS_BY_AREA {
  if (pathname === "/") return "home";
  if (/^\/swarms\/[0-9a-f-]{36}\/runs\//i.test(pathname)) return "run";
  if (pathname === "/swarms/new" || pathname.endsWith("/edit")) return "builder";
  if (pathname.startsWith("/swarms")) return "swarms";
  if (pathname.startsWith("/crews")) return "crews";
  return "home";
}

export function RailRight() {
  const pathname = usePathname() ?? "/";
  const area = pickArea(pathname);
  const tips = TIPS_BY_AREA[area];

  return (
    <aside className="ct-rail-right">
      <div className="ct-rail-right-header">
        <span className="ct-rail-right-title">Assistant</span>
        <button type="button" className="ct-rail-right-btn" aria-label="Nouveau">
          +
        </button>
      </div>
      <div className="ct-rail-right-body">
        <SectionLabel text={`Contexte · ${area}`} mb={12} />

        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}>
          {tips.map((t) => (
            <div
              key={t.title}
              className="ct-card"
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 12,
                  color: "var(--ct-text-strong)",
                  marginBottom: 4,
                }}
              >
                {t.title}
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--ct-text-body)",
                  lineHeight: 1.5,
                }}
              >
                {t.body}
              </p>
            </div>
          ))}

          <div
            style={{
              marginTop: SPACING.md,
              paddingTop: SPACING.md,
              borderTop: "1px solid var(--ct-border-soft)",
              fontSize: 11,
              color: "var(--ct-text-muted)",
              lineHeight: 1.5,
            }}
          >
            Besoin d&apos;aide ? Va sur{" "}
            <Link
              href="/swarms"
              className="ct-link"
            >
              /swarms
            </Link>
            {" "}pour la liste, ou{" "}
            <Link
              href="/swarms/new"
              className="ct-link"
            >
              /swarms/new
            </Link>
            {" "}pour démarrer.
          </div>
        </div>
      </div>
    </aside>
  );
}
