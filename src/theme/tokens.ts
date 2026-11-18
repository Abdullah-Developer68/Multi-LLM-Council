/**
 * Design tokens — "shadcn dark".
 *
 * Ported from the StudyBot "shadcn" token set (`--color-sn-*`): a near-black
 * canvas, one raised card surface, hairline borders, a white primary, and
 * Geist type. Every colour below is a role, not a value: components
 * reference `colors.card`, never a hex. See DESIGN_SYSTEM.md for usage rules.
 */

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | ColorScheme;

export interface Palette {
  /** App chrome. The sidebar sits directly on it. */
  background: string;
  /** Default text and icons. */
  foreground: string;
  /** Raised surface: the inset main panel, cards, the composer. */
  card: string;
  /** Floating surfaces: menus, dialogs, sheets, toasts. */
  popover: string;
  /** Quiet fill: hover, the active row, the user bubble, icon tiles. */
  muted: string;
  /** Secondary text: descriptions, captions, inactive icons, placeholders. */
  mutedForeground: string;
  /** Tertiary text: overflow icons, shortcuts, the muted line of a headline. */
  faint: string;
  /** Hairline dividers and card outlines. */
  border: string;
  /** Control outlines: inputs, outline buttons, toggle groups. */
  input: string;
  /** Focus ring. */
  ring: string;
  /** The single strong action colour (white on dark, near-black on light). */
  primary: string;
  primaryForeground: string;
  /** Inline links and "show more" affordances. */
  link: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  destructive: string;
  destructiveSoft: string;
  /** Scrim behind dialogs and the drawer. */
  overlay: string;
  /** Drop-shadow colour for floating surfaces. */
  shadow: string;
  /** Code block well and its header strip. */
  codeBg: string;
  codeHeader: string;
  /** Identity dot for each council seat. */
  seats: Record<string, string>;
}

export const palettes: Record<ColorScheme, Palette> = {
  dark: {
    background: '#0A0A0A',
    foreground: '#FAFAFA',
    card: '#141414',
    popover: '#171717',
    muted: '#212121',
    mutedForeground: '#A1A1A1',
    faint: '#6B6B6B',
    border: '#262626',
    input: '#333333',
    ring: '#525252',
    primary: '#FAFAFA',
    primaryForeground: '#0A0A0A',
    link: '#60A5FA',
    success: '#22C55E',
    successSoft: 'rgba(34, 197, 94, 0.12)',
    warning: '#FACC15',
    warningSoft: 'rgba(250, 204, 21, 0.12)',
    destructive: '#F87171',
    destructiveSoft: 'rgba(248, 113, 113, 0.12)',
    overlay: 'rgba(0, 0, 0, 0.6)',
    shadow: 'rgba(0, 0, 0, 0.6)',
    codeBg: '#0A0A0A',
    codeHeader: '#171717',
    seats: {
      'nemotron-lightning': '#60A5FA',
      'north-mini-code': '#34D399',
      'nemotron-ultra': '#FBBF24',
    },
  },
  light: {
    background: '#F7F7F7',
    foreground: '#111111',
    card: '#FFFFFF',
    popover: '#FFFFFF',
    muted: '#F2F2F2',
    mutedForeground: '#737373',
    faint: '#A3A3A3',
    border: '#E8E8E8',
    input: '#E0E0E0',
    ring: '#A3A3A3',
    primary: '#0A0A0A',
    primaryForeground: '#FFFFFF',
    link: '#2563EB',
    success: '#16A34A',
    successSoft: 'rgba(22, 163, 74, 0.1)',
    warning: '#A16207',
    warningSoft: 'rgba(234, 179, 8, 0.14)',
    destructive: '#DC2626',
    destructiveSoft: 'rgba(220, 38, 38, 0.08)',
    overlay: 'rgba(0, 0, 0, 0.32)',
    shadow: 'rgba(0, 0, 0, 0.12)',
    codeBg: '#FAFAFA',
    codeHeader: '#F2F2F2',
    seats: {
      'nemotron-lightning': '#2563EB',
      'north-mini-code': '#059669',
      'nemotron-ultra': '#D97706',
    },
  },
};

export const fonts = {
  light: 'Geist_300Light',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

/**
 * Type scale. Body copy is 14px like shadcn; messages get a touch more room
 * because they are read, not scanned. Letter-spacing is the design's -0.006em
 * on text and up to -0.03em on display sizes.
 */
export const type = {
  display: { fontFamily: fonts.medium, fontSize: 24, lineHeight: 30, letterSpacing: -0.72 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 },
  headline: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, letterSpacing: -0.2 },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, letterSpacing: -0.09 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, letterSpacing: -0.08 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: -0.08 },
  callout: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, letterSpacing: -0.08 },
  calloutMedium: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19, letterSpacing: -0.08 },
  caption: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, letterSpacing: 0 },
  label: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0 },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, letterSpacing: 0 },
} as const;

export type TypeVariant = keyof typeof type;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

/** shadcn radii: controls use `md`, cards `lg`, the composer `xl`. */
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 } as const;

/** Control heights. */
export const control = { sm: 32, md: 36, lg: 40 } as const;

/** Screen metrics for the phone layout. */
export const layout = {
  headerHeight: 56,
  gutter: 16,
  drawerMaxWidth: 320,
} as const;

/** Spring presets shared by every animation so motion feels consistent. */
export const springs = {
  snappy: { damping: 20, stiffness: 260, mass: 0.7 },
  gentle: { damping: 22, stiffness: 160, mass: 0.9 },
  bouncy: { damping: 14, stiffness: 220, mass: 0.8 },
} as const;

/** Elevation for floating surfaces (menus, dialogs, the composer). */
export function elevation(colors: Palette, level: 1 | 2 = 1) {
  return {
    boxShadow:
      level === 1
        ? `0px 8px 24px -12px ${colors.shadow}`
        : `0px 16px 40px -12px ${colors.shadow}`,
  } as const;
}
