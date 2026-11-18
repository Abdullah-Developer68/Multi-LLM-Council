import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { providerFromModel, type ProviderKey } from '@/shared/council';
import { fonts, radius, useTheme } from '@/theme';
import { Txt } from './ui/text';

/** Council mark: three seats around a table. */
export function LogoMark({ size = 20, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const fill = color ?? colors.foreground;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="6" r="4.2" fill={fill} />
      <Circle cx="5.6" cy="17" r="4.2" fill={fill} />
      <Circle cx="18.4" cy="17" r="4.2" fill={fill} opacity={0.38} />
    </Svg>
  );
}

/** The mark on a primary tile (26px in the sidebar, 48px on the new-chat screen). */
export function LogoTile({ size = 26 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.logoTile,
        { width: size, height: size, borderRadius: Math.round(size * 0.27), backgroundColor: colors.primary },
      ]}
    >
      <LogoMark size={Math.round(size * 0.54)} color={colors.primaryForeground} />
    </View>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <View style={styles.wordmark}>
      <LogoTile size={size} />
      <Txt style={{ fontFamily: fonts.semibold, fontSize: 16, lineHeight: 20, letterSpacing: -0.32 }}>Council</Txt>
    </View>
  );
}

function NvidiaLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 86.6 512 338.8">
      <Path
        d="M52.3 232.5s46.3-68.3 138.7-75.4v-24.8C88.7 140.5 0 227.2 0 227.2s50.2 145.2 191 158.4v-26.3C87.7 346.3 52.3 232.5 52.3 232.5M191 307v24.1C112.9 317.2 91.3 236 91.3 236s37.5-41.5 99.8-48.3v26.5h-.1c-32.7-3.9-58.2 26.6-58.2 26.6S147 292.2 191 307m0-220.4v45.7c3-.2 6-.4 9-.5 116.4-3.9 192.2 95.5 192.2 95.5s-87.1 105.9-177.8 105.9c-8.3 0-16.1-.8-23.4-2.1v28.3c6.3.8 12.7 1.3 19.5 1.3 84.4 0 145.5-43.1 204.6-94.2 9.8 7.9 49.9 27 58.2 35.3-56.2 47.1-187.3 85-261.5 85-7.2 0-14-.4-20.8-1.1v39.7h321V86.6zm0 101.1v-30.6c3-.2 6-.4 9-.5 83.7-2.6 138.6 71.9 138.6 71.9s-59.3 82.4-122.9 82.4c-9.2 0-17.4-1.5-24.7-4v-92.8c32.6 3.9 39.1 18.3 58.7 51l43.6-36.7s-31.8-41.7-85.4-41.7c-5.8 0-11.4.4-16.9 1"
        fill="#76B900"
      />
    </Svg>
  );
}

function CohereLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z"
        fill="#39594D"
      />
      <Path
        d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z"
        fill="#D18EE2"
      />
      <Path d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z" fill="#FF7759" />
    </Svg>
  );
}

const GLYPH: Record<Exclude<ProviderKey, 'nvidia' | 'cohere'>, string> = { google: 'G', openai: 'P', other: '•' };

/** Vendor initial for models without a bundled logo (`openrouter/free` → `O`). */
function glyphFor(key: ProviderKey, model?: string): string {
  if (key === 'other' && model) return (model.split('/')[0]?.[0] ?? '•').toUpperCase();
  return GLYPH[key as keyof typeof GLYPH] ?? '•';
}

/** Logo tile for whichever provider actually served a model (it can change after rotation). */
export function ProviderLogo({ model, provider, size = 30 }: { model?: string; provider?: ProviderKey; size?: number }) {
  const { colors } = useTheme();
  const key = provider ?? providerFromModel(model);
  const inner = Math.round(size * 0.56);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: Math.min(radius.md, size * 0.3), backgroundColor: colors.muted, borderColor: colors.border },
      ]}
    >
      {key === 'nvidia' ? (
        <NvidiaLogo size={inner} />
      ) : key === 'cohere' ? (
        <CohereLogo size={inner} />
      ) : (
        <Txt style={{ fontFamily: fonts.semibold, fontSize: size * 0.42, lineHeight: size * 0.5 }} tone="secondary">
          {glyphFor(key, model)}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoTile: { alignItems: 'center', justifyContent: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
