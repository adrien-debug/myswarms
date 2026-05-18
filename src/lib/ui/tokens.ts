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
  hair: 2, // séparateur micro (1px optique sur HiDPI)
  xxs: 6,  // extra-extra-small (pré-existant dans la grille du builder)
  xs: 4,
  sm: 8,
  s: 10,   // demi-pas entre sm et md
  md: 12,
  lg: 16,
  lx: 20,  // large-extra : intermédiaire lg→xl
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  hair: 1, // micro-border pour séparateurs quasi-plats
  xs: 3,   // badge compact (tags, chips)
  sm: 4,
  md: 8,
  lg: 12,
  nav: 10, // rail de navigation latéral
  full: 9999,
} as const;

export const FONT = {
  nano: 9,  // label micro (icône-only, status dot)
  xxs: 11,  // légendes compactes (table header réduit)
  xs: 10,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
} as const;

// Line-height pour paragraphes et éléments de liste.
export const LINE_HEIGHT = {
  tight: 1.5, // textes courts / éléments de menu
  base: 1.6,  // corps de texte standard
} as const;

// Poids de police (font-weight).
export const FONT_WEIGHT = {
  regular: 400,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

// Letter-spacing pour les labels uppercase (overview / picker headers).
export const LETTER_SPACING = {
  tight: "0.08em",
  wide: "0.14em",
} as const;

// Préfixe les types pour le DX (autocomplete IDE).
export type Spacing = keyof typeof SPACING;
export type Radius = keyof typeof RADIUS;
export type Font = keyof typeof FONT;
export type LineHeight = keyof typeof LINE_HEIGHT;
