"use client";

import { useHubMode } from "@hearst/hub-sdk";

// ---------------------------------------------------------------------------
// Contrat hub-mode Phase A — Hive (Hearst Hive, #3FA7E0)
//
// Embarqué dans le hub Hearst (?hub=1 / window.hearstHub / session),
// Hive masque son propre chrome (rail gauche, rail droit, ambient layers)
// pour ne pas doubler le chrome du hub. Standalone (isHub===false) : no-op strict.
//
// WHY backdrop-filter → none :
// Dans un guest <webview> Electron, Chromium ne peut pas résoudre
// backdrop-filter:blur, -webkit-backdrop-filter, ni mask-image correctement →
// zones noires/vides. On neutralise .ct-rail-left, .ct-rail-right, .ct-bottom-bar
// qui portent ces propriétés, et .ct-ambient-* qui portent des filter/mask.
// ---------------------------------------------------------------------------
export function HubModeStyles() {
  const { isHub } = useHubMode();
  if (!isHub) return null;
  return (
    <style>{`
      /* ── Chrome Hive : rails + ambient masqués ──────────────── */
      .ct-rail-left   { display: none !important; }
      .ct-rail-right  { display: none !important; }
      .ct-ambient-deep { display: none !important; }
      .ct-ambient-glow { display: none !important; }

      /* ── Center panel full-width sans les rails ──────────────── */
      .ct-center-panel { min-width: 0 !important; }

      /* ── backdrop-filter → none (webview compositing) ─────────── */
      .ct-bottom-bar {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        background: rgba(10,10,10,0.85) !important;
      }

      /* ── preserve-3d → flat (stacking context cassé en guest webview) ── */
      .preserve-3d { transform-style: flat !important; }
      .perspective-scene { perspective: none !important; }
    `}</style>
  );
}
