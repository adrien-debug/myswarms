// Design tokens centralisés Cockpit — source de vérité TypeScript.
// Convention : valeurs en `number` (pixels) côté style inline / props CSS-in-JS.
// Base 4 (xs=4 → xxl=32), cohérente avec Tailwind 4 et la SPEC Cockpit.
//
// Usage :
//   import { SPACING, RADIUS, FONT } from "@/lib/ui/tokens";
//   <div style={{ padding: SPACING.md, borderRadius: RADIUS.md, fontSize: FONT.base }} />

export const SPACING = {
  hair: 2,
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
  hair: 1,
  xs: 3,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  nav: 10,
  full: 9999,
} as const;

export const FONT = {
  nano: 9,
  xxs: 11,
  xs: 10,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  display: 22,
  xxl: 24,
  iconLg: 32,
} as const;

export const LINE_HEIGHT = {
  tight: 1.5,
  base: 1.6,
} as const;

export const FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const LETTER_SPACING = {
  tightNeg: "-0.02em",
  tight: "0.08em",
  mid: "0.12em",
  wide: "0.14em",
} as const;

export const Z_INDEX = {
  base: 0,
  ambient: 0,
  panel: 10,
  rail: 20,
  bottomBar: 30,
  modal: 100,
  toast: 200,
} as const;

export const SHADOW = {
  depth: "var(--ct-shadow-depth)",
  nowGlow: "var(--ct-shadow-now-glow)",
} as const;

export const COLOR = {
  brandHive: "var(--ct-brand-hive)",
  textOnAccent: "var(--ct-text-on-accent)",
  overlayModal: "var(--ct-overlay-modal)",
  overlayDark: "var(--ct-overlay-dark)",
} as const;

export const BLUR = {
  panel: "blur(60px) saturate(110%) brightness(105%)",
  modal: "blur(24px) saturate(150%)",
  modalLight: "blur(4px)",
} as const;

export const SIZE = {
  logo: 40,
  logoLg: 48,
  previewMaxH: 480,
  outputMaxH: 240,
  iconSm: 14,
  iconMd: 16,
  iconLg: 20,
  btnClose: 44,
  spinner: 28,
  modalMaxWidth: 560,
  timelineRow: 40,
  agentDiffTimeCol: 38,
} as const;

export const TRANSITION = {
  fast: "180ms",
  medium: "400ms",
} as const;

export const OPACITY = {
  disabled: 0.5,
  muted: 0.6,
} as const;

