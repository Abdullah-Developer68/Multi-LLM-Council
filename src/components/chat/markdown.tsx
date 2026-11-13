import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown, { type RenderRules } from 'react-native-markdown-display';

import { haptic } from '@/lib/haptics';
import { fonts, makeStyles, radius, useTheme } from '@/theme';
import { Txt } from '../ui/text';

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(code.replace(/\n$/, ''));
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <View style={[styles.code, { backgroundColor: colors.codeBg, borderColor: colors.border }]}>
      <View style={[styles.codeHeader, { backgroundColor: colors.codeHeader, borderBottomColor: colors.border }]}>
        <Txt variant="label" tone="secondary">
          {lang || 'code'}
        </Txt>
        <Pressable onPress={copy} hitSlop={8} style={styles.codeCopy} accessibilityLabel="Copy code">
          {copied ? (
            <Check size={13} color={colors.success} strokeWidth={2} />
          ) : (
            <Copy size={13} color={colors.textTertiary} strokeWidth={1.8} />
          )}
          <Txt variant="label" tone={copied ? 'success' : 'secondary'}>
            {copied ? 'Copied' : 'Copy code'}
          </Txt>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScroll}>
        <Text selectable style={[styles.codeText, { color: colors.text }]}>
          {code.replace(/\n$/, '')}
        </Text>
      </ScrollView>
    </View>
  );
}

function columnCount(node: { children?: { children?: unknown[] }[] }): number {
  const firstRow = (node.children?.[0]?.children?.[0] ?? {}) as { children?: unknown[] };
  return Math.max(1, firstRow.children?.length ?? 2);
}

const rules: RenderRules = {
  table: (node, children, _parent, mdStyles) => (
    <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator={false}>
      <View style={[mdStyles.table, { width: columnCount(node as never) * 160 }]}>{children}</View>
    </ScrollView>
  ),
  fence: (node) => <CodeBlock key={node.key} code={node.content} lang={(node as { sourceInfo?: string }).sourceInfo ?? ''} />,
  code_block: (node) => <CodeBlock key={node.key} code={node.content} lang="" />,
};

export function MarkdownView({ children }: { children: string }) {
  const md = useMarkdownStyles();
  return (
    <Markdown
      style={md}
      rules={rules}
      onLinkPress={(url) => {
        Linking.openURL(url).catch(() => {});
        return false;
      }}
    >
      {children}
    </Markdown>
  );
}

const MONO = Platform.select({ web: fonts.mono, default: fonts.mono });

const styles = StyleSheet.create({
  code: { borderWidth: 1, borderRadius: radius.md, marginVertical: 10, overflow: 'hidden' },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  codeCopy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  codeScroll: { padding: 12 },
  codeText: { fontFamily: MONO, fontSize: 12.5, lineHeight: 19 },
});

const useMarkdownStyles = makeStyles((c) => ({
  body: { color: c.text, fontFamily: fonts.regular, fontSize: 16, lineHeight: 27 },
  paragraph: { marginTop: 0, marginBottom: 12 },
  heading1: { fontFamily: fonts.medium, fontSize: 21, lineHeight: 27, letterSpacing: -0.4, marginTop: 8, marginBottom: 8 },
  heading2: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.3, marginTop: 8, marginBottom: 6 },
  heading3: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, marginTop: 6, marginBottom: 4 },
  heading4: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, marginTop: 4, marginBottom: 4 },
  strong: { fontFamily: fonts.semibold, fontWeight: '600' },
  em: { fontStyle: 'italic' },
  link: { color: c.accent, textDecorationLine: 'none' },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginVertical: 2 },
  bullet_list_icon: { color: c.textTertiary, marginRight: 8 },
  ordered_list_icon: { color: c.textTertiary, fontFamily: fonts.mono, fontSize: 13, marginRight: 8 },
  blockquote: {
    backgroundColor: c.surfaceMuted,
    borderLeftColor: c.borderStrong,
    borderLeftWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 8,
  },
  code_inline: {
    fontFamily: fonts.mono,
    fontSize: 13,
    backgroundColor: c.codeBg,
    color: c.text,
    borderRadius: 4,
    paddingHorizontal: 4,
    borderWidth: 0,
  },
  hr: { backgroundColor: c.border, height: 1, marginVertical: 14 },
  table: { borderColor: c.border, borderWidth: 1, borderRadius: radius.sm, marginVertical: 10 },
  thead: { backgroundColor: c.surfaceMuted },
  th: { padding: 8, fontFamily: fonts.medium },
  td: { padding: 8 },
  tr: { borderColor: c.border, borderBottomWidth: 1 },
}));
