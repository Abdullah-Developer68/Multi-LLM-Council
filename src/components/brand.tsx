import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { fonts, useTheme } from '@/theme';
import { ProviderLogo as BaseProviderLogo, type ProviderLogoProps } from './provider-logo';
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

/** Backwards-compatible re-export defaulting to the framed tile used on status/insights cards. */
export function ProviderLogo({ size = 30, tile = true, ...rest }: ProviderLogoProps) {
  return <BaseProviderLogo size={size} tile={tile} {...rest} />;
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logoTile: { alignItems: 'center', justifyContent: 'center' },
});
