/**
 * Design tokens.
 *
 * A familiar chat-app system: a white (light) or charcoal (dark) canvas, a
 * soft grey sidebar, grey bubbles for the user's messages and unboxed
 * assistant answers, pill-shaped composer and buttons, and one blue for links.
 */

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | ColorScheme;

export interface Palette {
  bg: string;
  sidebar: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  bubble: string;
  composer: string;
  hover: string;
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
  codeHeader: string;
  seats: Record<string, string>;
}

/** Neutral chat-app palette: white / charcoal canvas, grey user bubbles, soft sidebar. */
export const palettes: Record<ColorScheme, Palette> = {
  light: {
    bg: '#FFFFFF',
    sidebar: '#F9F9F9',
    surface: '#FFFFFF',
    surfaceMuted: '#F4F4F4',
    surfaceSunken: '#ECECEC',
    bubble: '#F4F4F4',
    composer: '#FFFFFF',
    hover: '#ECECEC',
    border: '#E5E5E5',
    borderStrong: '#D4D4D4',
    text: '#0D0D0D',
    textSecondary: '#5D5D5D',
    textTertiary: '#8F8F8F',
    primary: '#0D0D0D',
    onPrimary: '#FFFFFF',
    accent: '#2563EB',
    accentSoft: '#EAF1FE',
    success: '#16A34A',
    successSoft: '#E8F6EC',
    danger: '#DC2626',
    dangerSoft: '#FDECEC',
    warning: '#B45309',
    warningSoft: '#FDF3E3',
    overlay: 'rgba(0, 0, 0, 0.35)',
    skeleton: '#EFEFEF',
    skeletonHighlight: '#F7F7F7',
    codeBg: '#F9F9F9',
    codeHeader: '#F0F0F0',
    seats: {
      'nemotron-lightning': '#3B82C4',
      'north-mini-code': '#2F9E6E',
      'nemotron-ultra': '#C2841F',
    },
  },
  dark: {
    bg: '#212121',
    sidebar: '#181818',
    surface: '#2A2A2A',
    surfaceMuted: '#303030',
    surfaceSunken: '#1A1A1A',
    bubble: '#303030',
    composer: '#303030',
    hover: '#2F2F2F',
    border: '#383838',
    borderStrong: '#4A4A4A',
    text: '#ECECEC',
    textSecondary: '#B4B4B4',
    textTertiary: '#8B8B8B',
    primary: '#ECECEC',
    onPrimary: '#0D0D0D',
    accent: '#7AA7FF',
    accentSoft: 'rgba(122, 167, 255, 0.14)',
    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.12)',
    danger: '#F87171',
    dangerSoft: 'rgba(248, 113, 113, 0.13)',
    warning: '#FBBF24',
    warningSoft: 'rgba(251, 191, 36, 0.12)',
    overlay: 'rgba(0, 0, 0, 0.55)',
    skeleton: '#2E2E2E',
    skeletonHighlight: '#363636',
    codeBg: '#171717',
    codeHeader: '#262626',
    seats: {
      'nemotron-lightning': '#6CB4F0',
      'north-mini-code': '#5CD39B',
      'nemotron-ultra': '#F0B44C',
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
  display: { fontFamily: fonts.medium, fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  title: { fontFamily: fonts.medium, fontSize: 24, lineHeight: 30, letterSpacing: -0.6 },
  headline: { fontFamily: fonts.medium, fontSize: 19, lineHeight: 25, letterSpacing: -0.35 },
  message: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 27, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, letterSpacing: -0.1 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, letterSpacing: -0.15 },
  callout: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, letterSpacing: -0.05 },
  calloutMedium: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, letterSpacing: 0 },
  label: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, letterSpacing: 0 },
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
