import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { useAppStore } from '@/store';
import { palettes, type ColorScheme, type Palette } from './tokens';

export * from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
}

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: palettes.light });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const preference = useAppStore((s) => s.themePreference);
  const scheme: ColorScheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  return <ThemeContext.Provider value={{ scheme, colors: palettes[scheme] }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Creates a themed StyleSheet hook. Each scheme's sheet is built once and
 * cached, so components get stable style objects without per-render work.
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (colors: Palette, scheme: ColorScheme) => T & NamedStyles<any>,
) {
  const cache: Partial<Record<ColorScheme, T>> = {};
  return function useStyles(): T {
    const { scheme, colors } = useTheme();
    return (cache[scheme] ??= StyleSheet.create(factory(colors, scheme)) as T);
  };
}
