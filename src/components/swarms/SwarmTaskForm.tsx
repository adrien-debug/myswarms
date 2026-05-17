"use client";

import { useState } from "react";
import type { AgentInput, TaskInput } from "@/lib/forms/swarmSchemas";
import { FONT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

interface SwarmTaskFormProps {
  initialTask?: TaskInput;
  agents: AgentInput[];
  tasks: TaskInput[];
  onSubmit: (task: TaskInput) => void;
  onCancel?: () => void;
}

// C4 : agent_id n'est plus nullable → initialiser sur le 1er agent dispo
// (le formulaire n'est plus accessible si aucun agent n'existe).
const buildDefaultTask = (agents: AgentInput[]): TaskInput => ({
  agent_id: agents.find((a) => a.id)?.id ?? "",
  name: "",
  description: "",
  expected_output: "",
  depends_on_task_id: null,
  position_x: 0,
  position_y: 0,
});

export function SwarmTaskForm({
  initialTask,
  agents,
  tasks,
  onSubmit,
  onCancel,
}: SwarmTaskFormProps) {
  const [task, setTask] = useState<TaskInput>(
    initialTask ?? buildDefaultTask(agents),
  );

  const update = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setTask((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(task);
  };

  // Filtrer la tâche elle-même (cycle évident)
  const dependableTasks = tasks.filter((t) => t.id !== initialTask?.id);
  // C4 : seuls les agents persistés (avec id) peuvent être assignés.
  const assignableAgents = agents.filter((a) => a.id);

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACING.lg }}>
        <label style={labelStyle}>
          <span style={labelText}>Nom</span>
          <input
            type="text"
            value={task.name}
            onChange={(e) => update("name", e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          <span style={labelText}>Agent assigné</span>
          <select
            value={task.agent_id ?? ""}
            onChange={(e) => update("agent_id", e.target.value)}
            required
            style={inputStyle}
          >
            {/* H1 : si la task chargée a agent_id null/vide (post cascade
                SET NULL), on affiche un placeholder explicite pour forcer
                un re-pair AVANT save (TaskInputSchema reste required). */}
            {!task.agent_id ? (
              <option value="" disabled>
                Aucun agent — re-pair requis
              </option>
            ) : null}
            {assignableAgents.length === 0 ? (
              <option value="" disabled>
                Aucun agent — ajoute-en un d&apos;abord
              </option>
            ) : (
              assignableAgents.map((a) => (
                <option key={a.id} value={a.id as string}>
                  {a.name} ({a.role})
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        <span style={labelText}>Description</span>
        <textarea
          value={task.description}
          onChange={(e) => update("description", e.target.value)}
          required
          rows={4}
          style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }}
        />
      </label>

      <label style={labelStyle}>
        <span style={labelText}>Sortie attendue</span>
        <textarea
          value={task.expected_output}
          onChange={(e) => update("expected_output", e.target.value)}
          required
          rows={3}
          style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }}
        />
      </label>

      <label style={labelStyle}>
        <span style={labelText}>Dépend de la tâche</span>
        <select
          value={task.depends_on_task_id ?? ""}
          onChange={(e) =>
            update(
              "depends_on_task_id",
              e.target.value === "" ? null : e.target.value,
            )
          }
          style={inputStyle}
        >
          <option value="">Aucune (racine)</option>
          {dependableTasks.map((t) =>
            t.id ? (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ) : null,
          )}
        </select>
      </label>

      <div style={{ display: "flex", gap: SPACING.sm, justifyContent: "flex-end" }}>
        {onCancel ? (
          <button type="button" className="ct-seg-btn" onClick={onCancel}>
            Annuler
          </button>
        ) : null}
        <button type="submit" className="ct-seg-btn primary">
          {initialTask ? "Mettre à jour" : "Ajouter tâche"}
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xs + 2,
};
const labelText: React.CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: 600,
  letterSpacing: LETTER_SPACING.tight,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};
const inputStyle: React.CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
  outline: "none",
};
