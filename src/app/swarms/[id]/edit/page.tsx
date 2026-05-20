"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { SwarmBuilder } from "@/components/swarms/SwarmBuilder";
import type { SwarmRecord, Tool } from "@/lib/forms/swarmSchemas";
import { RADIUS, SPACING } from "@/lib/ui/tokens";
import { Chevron } from "@/components/ui/Chevron";
import { PageTitle } from "@/components/ui/PageTitle";
import { ErrorLayout } from "@/components/ui/ErrorLayout";

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
      <div style={{ padding: SPACING.xl }}>
        <style>{`
          @keyframes ct-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
        <div className="ct-card" style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}>
          <div style={{
            height: "var(--ct-skeleton-title-h)",
            background: "var(--ct-surface-3)",
            borderRadius: RADIUS.md,
            animation: "ct-pulse 1.5s ease-in-out infinite",
          }} />
          <div style={{
            height: "var(--ct-skeleton-line-h)",
            width: "60%",
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            animation: "ct-pulse 1.5s ease-in-out infinite 0.1s",
          }} />
          <div style={{
            height: "var(--ct-skeleton-body-h)",
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            animation: "ct-pulse 1.5s ease-in-out infinite 0.2s",
          }} />
        </div>
      </div>
    );
  }

  if (error || !swarm) {
    return (
      <>
        <div className="ct-eyebrow">
          <Link
            href="/swarms"
            className="ct-breadcrumb-link"
          >
            <Chevron direction="left" />Swarms
          </Link>
        </div>
        <ErrorLayout
          title="Edit failed"
          message={error ?? "Swarm not found."}
        />
      </>
    );
  }

  // Conversion SwarmRecord → SwarmInput.
  // `tasks` et `tool_bindings` peuvent avoir `agent_id=null` après une cascade
  // SET NULL en DB (task/binding orpheline). Le builder attend `agent_id: string`.
  // On normalise null → "" : SwarmTaskForm affiche "Aucun agent — re-pair requis"
  // et la validation Zod bloque le save tant que le re-pair n'est pas effectué.
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
          <Chevron direction="left" />{swarm.name}
        </Link>
      </div>
      <PageTitle>Edit swarm</PageTitle>
      <p className="ct-sub">Edit name, agents, tasks and linked tools.</p>

      <SwarmBuilder
        mode="edit"
        swarmId={id}
        initialSwarm={initialSwarm}
        availableTools={tools}
      />
    </>
  );
}
