/**
 * Design tokens.
 *
 * Editorial, monochrome system: warm off-white canvas, white cards on
 * hairline borders, near-black pill actions, two-tone headlines (muted lead
 * line + strong line), mono micro-labels like `[ 01 ]`, and a single blue for
 * links. Dark mode mirrors the same hierarchy on a near-black canvas.
 */

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | ColorScheme;

export interface Palette {
  bg: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
  codeBg: string;
  seats: Record<string, string>;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    bg: '#F7F7F5',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F1EE',
    surfaceSunken: '#ECECE8',
    border: '#E4E4E0',
    borderStrong: '#D2D2CC',
    text: '#141414',
    textSecondary: '#6B6B67',
    textTertiary: '#A2A29E',
    primary: '#111111',
    onPrimary: '#FFFFFF',
    accent: '#2F6FEB',
    accentSoft: '#E9F0FD',
    success: '#1D8A4B',
    successSoft: '#E6F4EB',
    danger: '#D23F3F',
    dangerSoft: '#FBEBEB',
    warning: '#A86B12',
    warningSoft: '#FBF2E2',
    overlay: 'rgba(20, 20, 20, 0.28)',
    skeleton: '#EDEDEA',
    skeletonHighlight: '#F7F7F5',
    codeBg: '#F4F4F1',
    seats: {
      'nemotron-lightning': '#3F94BE',
      'north-mini-code': '#4F9573',
      'nemotron-ultra': '#B07F33',
    },
  },
  dark: {
    bg: '#0A0A0A',
    surface: '#121212',
    surfaceMuted: '#191919',
    surfaceSunken: '#0E0E0E',
    border: '#232323',
    borderStrong: '#323232',
    text: '#EDEDEB',
    textSecondary: '#A09F9B',
    textTertiary: '#686865',
    primary: '#F2F2F0',
    onPrimary: '#0A0A0A',
    accent: '#6E9DFF',
    accentSoft: 'rgba(110, 157, 255, 0.13)',
    success: '#45CF88',
    successSoft: 'rgba(69, 207, 136, 0.12)',
    danger: '#FF6B6B',
    dangerSoft: 'rgba(255, 107, 107, 0.12)',
    warning: '#EDB159',
    warningSoft: 'rgba(237, 177, 89, 0.12)',
    overlay: 'rgba(0, 0, 0, 0.62)',
    skeleton: '#1A1A1A',
    skeletonHighlight: '#242424',
    codeBg: '#161616',
    seats: {
      'nemotron-lightning': '#6FC0E6',
      'north-mini-code': '#7CC6A0',
      'nemotron-ultra': '#E2B263',
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

export const type = {
  display: { fontFamily: fonts.regular, fontSize: 34, lineHeight: 38, letterSpacing: -1.2 },
  title: { fontFamily: fonts.regular, fontSize: 26, lineHeight: 31, letterSpacing: -0.8 },
  headline: { fontFamily: fonts.medium, fontSize: 19, lineHeight: 25, letterSpacing: -0.35 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, letterSpacing: -0.15 },
  callout: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, letterSpacing: -0.05 },
  calloutMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, letterSpacing: 0 },
  label: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
  mono: { fontFamily: fonts.mono, fontSize: 12.5, lineHeight: 18, letterSpacing: 0 },
} as const;

export type TypeVariant = keyof typeof type;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** Spring presets shared by every animation so motion feels consistent. */
export const springs = {
  snappy: { damping: 20, stiffness: 260, mass: 0.7 },
  gentle: { damping: 22, stiffness: 160, mass: 0.9 },
  bouncy: { damping: 14, stiffness: 220, mass: 0.8 },
} as const;
