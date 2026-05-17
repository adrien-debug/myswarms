const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  running: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-neutral-200 text-neutral-700",
  paused_hitl: "bg-amber-100 text-amber-800",
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const cls = STATUS_STYLES[status] ?? "bg-neutral-100 text-neutral-700";
  const padding = size === "md" ? "px-2.5 py-1" : "px-2.5 py-0.5";
  return (
    <span className={`inline-flex rounded-full ${padding} text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
