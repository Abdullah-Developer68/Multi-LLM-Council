import { useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { providerFromModel } from '@/shared/council';
import { fonts, radius, useTheme } from '@/theme';
import { COMPANY_SVGS } from './logos/svgs';
import { Txt } from './ui/text';

const ALIASES: Record<string, string> = {
  aws: 'amazon',
  bedrock: 'amazon',
  nova: 'amazon',
  claude: 'anthropic',
  gemini: 'google',
  gemma: 'google',
  wenxin: 'baidu',
  ling: 'inclusionai',
  kimi: 'moonshot',
  moonshotai: 'moonshot',
  zhipu: 'zai',
  'z-ai': 'zai',
  'meta-llama': 'meta',
  mistralai: 'mistral',
  'x-ai': 'xai',
  'dots-studio': 'dots',
  dotsstudio: 'dots',
  'particle-ai': 'particle',
  'arcee-ai': 'arcee',
  'allenai': 'ai2',
  xiaomimimo: 'xiaomi',
};

function normalizeSlug(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const clean = raw.trim().toLowerCase();
  if (!clean || clean === 'other') return undefined;
  return ALIASES[clean] ?? clean;
}

function resolveCompany({
  company,
  provider,
  model,
}: {
  company?: string | null;
  provider?: string | null;
  model?: string;
}): string | undefined {
  const fromCompany = normalizeSlug(company);
  if (fromCompany) return fromCompany;

  const fromProvider = normalizeSlug(provider);
  if (fromProvider) return fromProvider;

  if (model) {
    const legacy = normalizeSlug(providerFromModel(model));
    if (legacy) return legacy;
    const prefix = model.includes('/') ? model.split('/')[0] : undefined;
    const fromPrefix = normalizeSlug(prefix);
    if (fromPrefix) return fromPrefix;
  }

  return undefined;
}

function fallbackInitial(company: string | undefined, model: string | undefined): string {
  const source = company ?? (model?.includes('/') ? model.split('/')[0] : model);
  const ch = source?.trim()?.[0];
  return ch ? ch.toUpperCase() : '•';
}

export interface ProviderLogoProps {
  company?: string | null;
  model?: string;
  provider?: string | null;
  size?: number;
  /** Override colour for monochrome / `currentColor` marks (defaults to `colors.foreground`). */
  color?: string;
  /** Wrap the mark inside a bordered muted tile (used in card/status headers). */
  tile?: boolean;
}

/** Brand mark for an AI provider/company, with neutral initial-tile fallback. */
export function ProviderLogo({ company, model, provider, size = 22, color, tile = false }: ProviderLogoProps) {
  const { colors } = useTheme();
  const rawUid = useId();
  const uid = useMemo(() => rawUid.replace(/[^a-zA-Z0-9_-]/g, ''), [rawUid]);

  const slug = resolveCompany({ company, provider, model });
  const rawXml = slug ? COMPANY_SVGS[slug] : undefined;
  const fg = color ?? colors.foreground;

  const xml = useMemo(() => {
    if (!rawXml) return null;
    let next = rawXml.replaceAll('currentColor', fg);
    if (next.includes('url(#')) {
      const ids = new Set<string>();
      for (const match of next.matchAll(/\bid="([^"]+)"/g)) {
        ids.add(match[1]);
      }
      for (const id of ids) {
        const scoped = `${id}-${uid}`;
        next = next.replaceAll(`id="${id}"`, `id="${scoped}"`).replaceAll(`url(#${id})`, `url(#${scoped})`);
      }
    }
    return next;
  }, [rawXml, fg, uid]);

  if (!xml) {
    const fontSize = Math.max(8, Math.round(size * 0.44));
    const lineHeight = Math.max(10, Math.round(size * 0.54));
    return (
      <View
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: Math.min(radius.md, Math.max(4, Math.round(size * 0.3))),
            backgroundColor: colors.muted,
            borderColor: colors.border,
          },
        ]}
      >
        <Txt style={{ fontFamily: fonts.semibold, fontSize, lineHeight }} tone="secondary">
          {fallbackInitial(slug ?? company ?? undefined, model)}
        </Txt>
      </View>
    );
  }

  if (tile) {
    const inner = Math.round(size * 0.56);
    return (
      <View
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: Math.min(radius.md, Math.round(size * 0.3)),
            backgroundColor: colors.muted,
            borderColor: colors.border,
          },
        ]}
      >
        <SvgXml xml={xml} width={inner} height={inner} />
      </View>
    );
  }

  return (
    <View style={[styles.bare, { width: size, height: size }]}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  bare: { alignItems: 'center', justifyContent: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
