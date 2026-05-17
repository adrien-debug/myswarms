// H6 : aucun magic number à migrer ici — toute la mise en forme est portée
// par les classes .ct-kpi-grid / .ct-kpi-card / .ct-kpi-label / .ct-kpi-value
// (cockpit.css).

interface KPI {
  label: string;
  value: string | number;
  accent?: boolean;
}

interface KPIDashboardProps {
  kpis?: KPI[];
}

/**
 * 4 KPI cards alignées sur le shell cockpit (.ct-kpi-grid / .ct-kpi-card).
 * Si aucune valeur passée → placeholders "—".
 */
export function KPIDashboard({ kpis }: KPIDashboardProps) {
  const items: KPI[] = kpis ?? [
    { label: "Total swarms", value: "—", accent: true },
    { label: "Active runs", value: "—" },
    { label: "Runs 30j", value: "—" },
    { label: "Success rate", value: "—" },
  ];

  return (
    <div className="ct-kpi-grid">
      {items.map((kpi, i) => (
        <div
          key={`${kpi.label}-${i}`}
          className={kpi.accent ? "ct-kpi-card accent" : "ct-kpi-card"}
        >
          <div className="ct-kpi-label">{kpi.label}</div>
          <div className="ct-kpi-value">{kpi.value}</div>
        </div>
      ))}
    </div>
  );
}
