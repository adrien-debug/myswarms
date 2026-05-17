"use client";

import { useState } from "react";
import { SwarmAgentForm } from "./SwarmAgentForm";
import type { AgentInput } from "@/lib/forms/swarmSchemas";
import { FONT, RADIUS, SPACING } from "@/lib/ui/tokens";

/**
 * G8 fix : tab "Agents" extrait de SwarmBuilder.
 * State local pour le formulaire (create + edit). Les mutations remontent au
 * parent via les callbacks `onAdd` / `onUpdate` / `onRemove`.
 */
interface BuilderAgentsTabProps {
  agents: AgentInput[];
  onAdd: (agent: AgentInput) => void;
  onUpdate: (idx: number, agent: AgentInput) => void;
  onRemove: (idx: number) => void;
}

export function BuilderAgentsTab({
  agents,
  onAdd,
  onUpdate,
  onRemove,
}: BuilderAgentsTabProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleAdd = (agent: AgentInput) => {
    onAdd(agent);
    setShowForm(false);
  };

  const handleUpdate = (idx: number, agent: AgentInput) => {
    onUpdate(idx, agent);
    setEditingIdx(null);
  };

  return (
    <div className="ct-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: SPACING.lg,
        }}
      >
        <div className="ct-card-title" style={{ marginBottom: 0 }}>
          Agents ({agents.length})
        </div>
        {!showForm && editingIdx === null ? (
          <button
            type="button"
            className="ct-seg-btn primary"
            onClick={() => setShowForm(true)}
          >
            + Ajouter
          </button>
        ) : null}
      </div>

      {showForm ? (
        <SwarmAgentForm
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {editingIdx !== null && agents[editingIdx] ? (
        <SwarmAgentForm
          initialAgent={agents[editingIdx]}
          onSubmit={(a) => handleUpdate(editingIdx, a)}
          onCancel={() => setEditingIdx(null)}
        />
      ) : null}

      {agents.length > 0 && !showForm && editingIdx === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.sm }}>
          {agents.map((a, idx) => (
            <div
              key={a.id ?? idx}
              style={{
                background: "var(--ct-surface-2)",
                border: "1px solid var(--ct-border)",
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: SPACING.md,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)" }}>
                  {a.role} · {a.model_provider}/{a.model_name}
                </div>
              </div>
              <div style={{ display: "flex", gap: SPACING.xs + 2 }}>
                <button
                  type="button"
                  className="ct-seg-btn"
                  onClick={() => setEditingIdx(idx)}
                >
                  Éditer
                </button>
                <button
                  type="button"
                  className="ct-seg-btn"
                  onClick={() => onRemove(idx)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {agents.length === 0 && !showForm ? (
        <p className="ct-placeholder">
          Aucun agent. Ajoute au moins un coordinator pour démarrer.
        </p>
      ) : null}
    </div>
  );
}
