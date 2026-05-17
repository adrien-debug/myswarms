"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { SwarmBuilder } from "@/components/swarms/SwarmBuilder";
import type { SwarmRecord, Tool } from "@/lib/forms/swarmSchemas";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditSwarmPage({ params }: PageProps) {
  const { id } = use(params);
  const [swarm, setSwarm] = useState<SwarmRecord | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [swarmRes, toolsRes] = await Promise.all([
          fetch(`/api/swarms/${id}`),
          fetch("/api/tools").catch(() => null),
        ]);
        if (!swarmRes.ok) {
          throw new Error(`Failed to load swarm: ${swarmRes.status}`);
        }
        const swarmData = (await swarmRes.json()) as SwarmRecord;
        if (cancelled) return;
        setSwarm(swarmData);

        if (toolsRes?.ok) {
          const toolsData = (await toolsRes.json()) as Tool[];
          if (!cancelled) setTools(Array.isArray(toolsData) ? toolsData : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <>
        <div className="ct-eyebrow">
          <Link
            href={`/swarms/${id}`}
            style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
          >
            ← Détail
          </Link>
        </div>
        <h1 className="ct-title">Chargement…</h1>
      </>
    );
  }

  if (error || !swarm) {
    return (
      <>
        <div className="ct-eyebrow">
          <Link
            href="/swarms"
            style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
          >
            ← Swarms
          </Link>
        </div>
        <h1 className="ct-title">Erreur</h1>
        <div
          className="ct-card"
          style={{ borderColor: "var(--ct-border-accent)" }}
        >
          <div className="ct-card-title">Chargement échoué</div>
          <p className="ct-card-body">{error ?? "Swarm introuvable."}</p>
        </div>
      </>
    );
  }

  // Conversion SwarmRecord → SwarmInput.
  // H1 fix : `tasks` et `tool_bindings` peuvent avoir `agent_id=null` (cas
  // réel après cascade SET NULL en DB — task/binding orpheline). Le builder
  // attend `agent_id: string`. On normalise null → "" pour que :
  //   - le sub-form (SwarmTaskForm) affiche "Aucun agent — re-pair requis"
  //   - la validation Zod (TaskInputSchema) bloque le save tant que pas re-pair
  // Cohérence : TaskInputSchema reste `required`, le UI force la sélection
  // avant le PATCH.
  const initialSwarm = {
    id: swarm.id,
    name: swarm.name,
    description: swarm.description ?? "",
    version: swarm.version,
    config_json: swarm.config_json,
    is_active: swarm.is_active,
    is_template: swarm.is_template,
    agents: swarm.agents,
    tasks: swarm.tasks.map((t) => ({
      ...t,
      agent_id: t.agent_id ?? "",
    })),
    tool_bindings: swarm.tool_bindings.map((b) => ({
      ...b,
      agent_id: b.agent_id ?? "",
    })),
  };

  return (
    <>
      <div className="ct-eyebrow">
        <Link
          href={`/swarms/${id}`}
          style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
        >
          ← {swarm.name}
        </Link>
      </div>
      <h1 className="ct-title">Éditer le swarm</h1>
      <p className="ct-sub">Modifie nom, agents, tâches et tools liés.</p>

      <SwarmBuilder
        mode="edit"
        swarmId={id}
        initialSwarm={initialSwarm}
        availableTools={tools}
      />
    </>
  );
}
