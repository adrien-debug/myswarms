import Link from "next/link";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary } from "@/lib/crewai/types";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";

interface Props {
  compact?: boolean;
}

// --- result parsing helpers ---

interface ActionItems {
  action_items: Array<{ text?: string; action?: string; title?: string } | string>;
}
interface InboxSummary {
  inbox_summary: { total?: number; p0?: number; p1?: number };
}
interface PreferenceHints {
  preference_hints: Array<string>;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasActionItems(v: unknown): v is ActionItems {
  return (
    typeof v === "object" &&
    v !== null &&
    "action_items" in v &&
    Array.isArray((v as ActionItems).action_items)
  );
}

function hasInboxSummary(v: unknown): v is InboxSummary {
  return (
    typeof v === "object" &&
    v !== null &&
    "inbox_summary" in v &&
    typeof (v as InboxSummary).inbox_summary === "object"
  );
}

function hasPreferenceHints(v: unknown): v is PreferenceHints {
  return (
    typeof v === "object" &&
    v !== null &&
    "preference_hints" in v &&
    Array.isArray((v as PreferenceHints).preference_hints)
  );
}

function ResultBody({ result }: { result: string }) {
  const parsed = tryParseJson(result);

  if (parsed !== null) {
    if (hasActionItems(parsed)) {
      const items = parsed.action_items.slice(0, 3);
      return (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {items.map((item, i) => {
            const label =
              typeof item === "string"
                ? item
                : item.text ?? item.action ?? item.title ?? JSON.stringify(item);
            return (
              <li
                key={i}
                style={{
                  fontSize: 12,
                  color: "var(--ct-text-body)",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--ct-accent-strong)", flexShrink: 0 }}>•</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ul>
      );
    }

    if (hasInboxSummary(parsed)) {
      const s = parsed.inbox_summary;
      return (
        <p
          style={{
            fontSize: 12,
            color: "var(--ct-text-body)",
            lineHeight: 1.6,
          }}
        >
          {s.total != null ? <><strong style={{ color: "var(--ct-text-strong)" }}>{s.total}</strong> messages</> : null}
          {s.p0 != null ? <> · <strong style={{ color: "var(--ct-accent-strong)" }}>{s.p0} P0</strong></> : null}
          {s.p1 != null ? <> · <span>{s.p1} P1</span></> : null}
        </p>
      );
    }

    if (hasPreferenceHints(parsed)) {
      const hints = parsed.preference_hints.slice(0, 2);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {hints.map((h, i) => (
            <p
              key={i}
              style={{
                fontSize: 12,
                fontStyle: "italic",
                color: "var(--ct-text-muted)",
                lineHeight: 1.5,
              }}
            >
              {h}
            </p>
          ))}
        </div>
      );
    }
  }

  // Plain text / raw markdown fallback
  const preview = result.length > 300 ? result.slice(0, 300) + "…" : result;
  return (
    <p
      style={{
        fontSize: 12,
        color: "var(--ct-text-body)",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
      }}
    >
      {preview}
    </p>
  );
}

export async function ChiefBriefWidget({ compact = false }: Props) {
  let run: RunSummary | null;
  let fetchError = false;

  try {
    const runs = await crewaiClient.listRuns("chief-of-staff", 1);
    run = runs[0] ?? null;
  } catch {
    fetchError = true;
    run = null;
  }

  if (fetchError) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">Chief of Staff</div>
        <p className="ct-card-body" style={{ color: "var(--ct-text-muted)" }}>
          Engine indisponible — impossible de charger le dernier brief.
        </p>
      </div>
    );
  }

  if (run === null) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">Chief of Staff</div>
        <p className="ct-card-body">
          Aucun brief lancé —{" "}
          <Link href="/crews/chief-of-staff" className="ct-link">
            déclenche ton premier.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="ct-card">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="ct-card-title" style={{ margin: 0 }}>
            Dernier brief
          </span>
          <StatusBadge status={run.status} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "var(--ct-text-muted)",
          }}
        >
          {run.trigger && (
            <span
              style={{
                background: "var(--ct-surface-2)",
                border: "1px solid var(--ct-border)",
                borderRadius: 4,
                padding: "2px 6px",
                fontFamily: "monospace",
              }}
            >
              {run.trigger}
            </span>
          )}
          <span>{formatDate(run.started_at)}</span>
        </div>
      </div>

      {/* Result body */}
      {run.result ? (
        <ResultBody result={run.result} />
      ) : (
        <p className="ct-placeholder">Pas encore de résultat pour ce run.</p>
      )}

      {/* Footer actions */}
      {!compact && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid var(--ct-border-soft)",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <Link
            href={`/crews/chief-of-staff/runs/${run.kickoff_id}`}
            className="ct-seg-btn"
            style={{ fontSize: 12 }}
          >
            Voir le brief complet →
          </Link>
          <Link
            href="/crews/chief-of-staff"
            className="ct-link"
            style={{ fontSize: 12 }}
          >
            Lancer un brief
          </Link>
        </div>
      )}

      {compact && (
        <div style={{ marginTop: 12 }}>
          <Link
            href="/crews/chief-of-staff"
            className="ct-link"
            style={{ fontSize: 12 }}
          >
            Lancer un brief
          </Link>
        </div>
      )}
    </div>
  );
}
