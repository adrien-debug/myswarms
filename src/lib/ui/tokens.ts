// G9 fix (Stage 4 pass 3) : design tokens centralisés pour éviter les magic
// numbers en pixels disséminés dans les composants.
//
// Convention : valeurs en `number` (pixels) côté style inline / props CSS-in-JS.
// La grille suit une base 4 (xs=4 → xxl=32) pour rester cohérente avec
// Tailwind 4 et le template visuel hearst-os.
//
// Usage :
//   import { SPACING, RADIUS, FONT } from "@/lib/ui/tokens";
//   <div style={{ padding: SPACING.md, borderRadius: RADIUS.md, fontSize: FONT.base }} />

export const SPACING = {
  xxs: 6,
  xs: 4,
  sm: 8,
  s: 10,
  md: 12,
  lg: 16,
  lx: 20,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const;

export const FONT = {
  xs: 10,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
} as const;

// Letter-spacing pour les labels uppercase (overview / picker headers).
export const LETTER_SPACING = {
  tight: "0.08em",
  wide: "0.14em",
} as const;

export const FONT_WEIGHT = {
  regular: 400,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

