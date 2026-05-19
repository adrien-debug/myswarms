import Link from "next/link";

interface Swarm {
  id: string;
  name: string;
  isActive: boolean;
}

interface Props {
  swarms: Swarm[];
}

export function SwarmFleet({ swarms }: Props) {
  if (!swarms || swarms.length === 0) {
    return (
      <div className="ct-card">
        <div className="ct-card-title">SWARM FLEET</div>
        <p className="ct-placeholder">
          Aucun swarm —{" "}
          <Link href="/swarms" className="ct-link">
            créer un swarm
          </Link>
        </p>
      </div>
    );
  }

  const list = swarms.slice(0, 5);

  return (
    <div className="ct-card">
      <div className="ct-card-title">SWARM FLEET</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map((swarm) => (
          <div
            key={swarm.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          >
            <span
              className={`status-badge ${swarm.isActive ? "nominal" : "warn"}`}
              style={{ flexShrink: 0 }}
            >
              {swarm.isActive ? "actif" : "pause"}
            </span>
            <Link
              href={`/swarms/${swarm.id}`}
              className="ct-link"
              style={{
                fontSize: 13,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {swarm.name}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
