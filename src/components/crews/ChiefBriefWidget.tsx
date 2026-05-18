import Link from "next/link";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary } from "@/lib/crewai/types";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { FONT, RADIUS, SPACING } from "@/lib/ui/tokens";

interface Props {
  compact?: boolean;
}

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

const ACTION_ITEMS_PREVIEW_COUNT = 3;
const PREFERENCE_HINTS_PREVIEW_COUNT = 2;
const PLAIN_TEXT_PREVIEW_MAX_CHARS = 300;

function ResultBody({ result }: { result: string }) {
  const parsed = tryParseJson(result);

  if (parsed !== null) {
    if (hasActionItems(parsed)) {
      const items = parsed.action_items.slice(0, ACTION_ITEMS_PREVIEW_COUNT);
      return (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: SPACING.xxs,
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
                  fontSize: FONT.sm,
                  color: "var(--ct-text-body)",
                  display: "flex",
                  gap: SPACING.sm,
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
            fontSize: FONT.sm,
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
      const hints = parsed.preference_hints.slice(0, PREFERENCE_HINTS_PREVIEW_COUNT);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xs }}>
          {hints.map((h, i) => (
            <p
              key={i}
              style={{
                fontSize: FONT.sm,
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

  const preview = result.length > PLAIN_TEXT_PREVIEW_MAX_CHARS
    ? result.slice(0, PLAIN_TEXT_PREVIEW_MAX_CHARS) + "…"
    : result;
  return (
    <p
      style={{
        fontSize: FONT.sm,
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: SPACING.md,
          gap: SPACING.md,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.s }}>
          <span className="ct-card-title" style={{ margin: 0 }}>
            Dernier brief
          </span>
          <StatusBadge status={run.status} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACING.sm,
            fontSize: FONT.xs,
            color: "var(--ct-text-muted)",
          }}
        >
          {run.trigger && (
            <span
              style={{
                background: "var(--ct-surface-2)",
                border: "1px solid var(--ct-border)",
                borderRadius: RADIUS.sm,
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

      {run.result ? (
        <ResultBody result={run.result} />
      ) : (
        <p className="ct-placeholder">Pas encore de résultat pour ce run.</p>
      )}

      {!compact && (
        <div
          style={{
            marginTop: SPACING.lg,
            paddingTop: SPACING.md,
            borderTop: "1px solid var(--ct-border-soft)",
            display: "flex",
            gap: SPACING.s,
            alignItems: "center",
          }}
        >
          <Link
            href={`/crews/chief-of-staff/runs/${run.kickoff_id}`}
            className="ct-seg-btn"
            style={{ fontSize: FONT.sm }}
          >
            Voir le brief complet →
          </Link>
          <Link
            href="/crews/chief-of-staff"
            className="ct-link"
            style={{ fontSize: FONT.sm }}
          >
            Lancer un brief
          </Link>
        </div>
      )}

      {compact && (
        <div style={{ marginTop: SPACING.md }}>
          <Link
            href="/crews/chief-of-staff"
            className="ct-link"
            style={{ fontSize: FONT.sm }}
          >
            Lancer un brief
          </Link>
        </div>
      )}
    </div>
  );
}
