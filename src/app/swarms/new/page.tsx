"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SwarmBuilder } from "@/components/swarms/SwarmBuilder";
import type { Tool } from "@/lib/forms/swarmSchemas";

export default function NewSwarmPage() {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Tool[]) => {
        if (!cancelled) setTools(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // Tool catalog peut ne pas être encore branché — silencieux
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <h1 className="ct-title">Nouveau swarm</h1>
      <p className="ct-sub">
        Définis le nom, les agents, les tâches et les outils. Tu pourras éditer
        après création.
      </p>

      <SwarmBuilder mode="create" availableTools={tools} />
    </>
  );
}
