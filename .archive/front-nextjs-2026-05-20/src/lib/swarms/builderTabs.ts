export const BUILDER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "tasks", label: "Tasks" },
  { id: "tools", label: "Tools" },
  { id: "preview", label: "Preview" },
] as const;

export type BuilderTabId = (typeof BUILDER_TABS)[number]["id"];

/**
 * Valide et résout l'ID d'onglet depuis un searchParam.
 * Fallback "overview" si valeur absente/invalide — garantit qu'au moins UN
 * onglet a aria-selected=true et tabIndex=0, sinon la tablist devient
 * inaccessible au clavier.
 */
export function parseBuilderTab(value: string | null | undefined): BuilderTabId {
  return BUILDER_TABS.some((t) => t.id === value)
    ? (value as BuilderTabId)
    : "overview";
}
