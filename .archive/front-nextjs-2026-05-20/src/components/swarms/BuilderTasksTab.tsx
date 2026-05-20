"use client";

import { useState } from "react";
import { SwarmTaskForm } from "./SwarmTaskForm";
import type { AgentInput, TaskInput } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";

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
          Tasks ({tasks.length})
        </div>
        {!showForm && editingIdx === null ? (
          <>
            <span
              id="add-task-help"
              className="sr-only"
            >
              Add at least one agent before adding a task.
            </span>
            <button
              type="button"
              className="ct-seg-btn primary"
              onClick={(e) => {
                if (agents.length === 0) { e.preventDefault(); return; }
                setShowForm(true);
              }}
              aria-disabled={agents.length === 0}
              aria-describedby={agents.length === 0 ? "add-task-help" : undefined}
              title={
                agents.length === 0
                  ? "Add an agent first (Agents tab)"
                  : undefined
              }
              style={{
                opacity: agents.length === 0 ? 0.5 : 1,
                cursor: agents.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              + Add
            </button>
          </>
        ) : null}
      </div>

      {agents.length === 0 && !showForm ? (
        <p
          className="ct-placeholder"
          style={{ color: "var(--ct-text-muted)" }}
        >
          Add an agent first — each task must be assigned to an agent.
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
                  <div style={{ fontWeight: FONT_WEIGHT.semibold }}>{t.name}</div>
                  <div
                    style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)" }}
                  >
                    {assignedAgent
                      ? `→ ${assignedAgent.name}`
                      : "agent unassigned"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: SPACING.xxs }}>
                  <button
                    type="button"
                    className="ct-seg-btn"
                    aria-label={`Edit task ${t.name}`}
                    onClick={() => setEditingIdx(idx)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ct-seg-btn"
                    aria-label={`Delete task ${t.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete task "${t.name}"?`)) {
                        onRemove(idx);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {tasks.length === 0 && !showForm && agents.length > 0 ? (
        <p className="ct-placeholder">
          No task yet. Define what each agent must do.
        </p>
      ) : null}
    </div>
  );
}
