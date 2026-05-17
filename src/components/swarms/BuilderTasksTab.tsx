"use client";

import { useState } from "react";
import { SwarmTaskForm } from "./SwarmTaskForm";
import type { AgentInput, TaskInput } from "@/lib/forms/swarmSchemas";
import { FONT, RADIUS, SPACING } from "@/lib/ui/tokens";

/**
 * G8 fix : tab "Tasks" extrait de SwarmBuilder.
 * Le `disabled` du bouton "+ Ajouter" et le placeholder dépendent de
 * `agents.length` — chaque task DOIT être assignée à un agent (C4 fix).
 */
interface BuilderTasksTabProps {
  agents: AgentInput[];
  tasks: TaskInput[];
  onAdd: (task: TaskInput) => void;
  onUpdate: (idx: number, task: TaskInput) => void;
  onRemove: (idx: number) => void;
}

export function BuilderTasksTab({
  agents,
  tasks,
  onAdd,
  onUpdate,
  onRemove,
}: BuilderTasksTabProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleAdd = (task: TaskInput) => {
    onAdd(task);
    setShowForm(false);
  };

  const handleUpdate = (idx: number, task: TaskInput) => {
    onUpdate(idx, task);
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
          Tâches ({tasks.length})
        </div>
        {!showForm && editingIdx === null ? (
          <button
            type="button"
            className="ct-seg-btn primary"
            onClick={() => setShowForm(true)}
            disabled={agents.length === 0}
            title={
              agents.length === 0
                ? "Crée d'abord un agent (onglet Agents)"
                : undefined
            }
          >
            + Ajouter
          </button>
        ) : null}
      </div>

      {agents.length === 0 && !showForm ? (
        <p
          className="ct-placeholder"
          style={{ color: "var(--ct-text-muted)" }}
        >
          Crée d&apos;abord un agent — chaque tâche doit être assignée à un agent.
        </p>
      ) : null}

      {showForm ? (
        <SwarmTaskForm
          agents={agents}
          tasks={tasks}
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {editingIdx !== null && tasks[editingIdx] ? (
        <SwarmTaskForm
          initialTask={tasks[editingIdx]}
          agents={agents}
          tasks={tasks}
          onSubmit={(t) => handleUpdate(editingIdx, t)}
          onCancel={() => setEditingIdx(null)}
        />
      ) : null}

      {tasks.length > 0 && !showForm && editingIdx === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.sm }}>
          {tasks.map((t, idx) => {
            const assignedAgent = agents.find((a) => a.id === t.agent_id);
            return (
              <div
                key={t.id ?? idx}
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
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div
                    style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)" }}
                  >
                    {assignedAgent
                      ? `→ ${assignedAgent.name}`
                      : "agent non assigné"}
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
            );
          })}
        </div>
      ) : null}

      {tasks.length === 0 && !showForm && agents.length > 0 ? (
        <p className="ct-placeholder">
          Aucune tâche. Définis ce que doit faire chaque agent.
        </p>
      ) : null}
    </div>
  );
}
