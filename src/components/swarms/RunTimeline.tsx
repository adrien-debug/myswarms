import { StepCard } from "./StepCard";
import type { SwarmRunStep } from "@/lib/forms/swarmSchemas";

// H6 : aucun magic number à migrer ici — le gap est implicite (marginBottom
// posé par StepCard). Conservé sans import tokens pour ne pas polluer.

interface RunTimelineProps {
  steps: SwarmRunStep[];
}

export function RunTimeline({ steps }: RunTimelineProps) {
  if (steps.length === 0) {
    return (
      <div className="ct-card">
        <p className="ct-placeholder">Pas encore d&apos;étapes exécutées.</p>
      </div>
    );
  }

  // Ordre croissant par step_number
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((step) => (
        <StepCard key={step.id} step={step} />
      ))}
    </div>
  );
}
