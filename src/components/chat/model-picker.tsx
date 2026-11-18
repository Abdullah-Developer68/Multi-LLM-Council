import { router } from 'expo-router';
import { Check, Lock, RotateCcw, Search, Sparkles, Star, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ProviderLogo } from '@/components/provider-logo';
import { Button } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Sheet } from '@/components/ui/sheet';
import { Txt } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { haptic } from '@/lib/haptics';
import { MODEL_SELECTION_LIMITS, type CatalogModel } from '@/shared/types';
import { useAppStore } from '@/store';
import { control, fonts, makeStyles, radius, type, useTheme } from '@/theme';

type Filter = 'all' | 'selected' | string;

const MODAL_NAV_DELAY_MS = 240;

function ModelSkeletons() {
  const styles = useStyles();
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton width={22} height={22} style={{ borderRadius: radius.sm }} />
          <View style={styles.skeletonText}>
            <Skeleton width={i % 2 === 0 ? '48%' : '58%'} height={15} />
            <Skeleton width={i % 2 === 0 ? '84%' : '72%'} height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CostHint({ cost }: { cost: 1 | 2 | 3 }) {
  const { colors } = useTheme();
  return (
    <Text style={[type.mono, stylesStatic.cost]} accessibilityLabel={`Cost tier ${cost} of 3`}>
      <Text style={{ color: colors.mutedForeground }}>{'£'.repeat(cost)}</Text>
      {cost < 3 ? <Text style={{ color: colors.input }}>{'£'.repeat(3 - cost)}</Text> : null}
    </Text>
  );
}

function ModelRow({
  model,
  selected,
  onPress,
}: {
  model: CatalogModel;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const locked = model.access === 'pro';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={locked ? 'button' : 'checkbox'}
      accessibilityState={locked ? undefined : { checked: selected }}
      accessibilityLabel={`${model.name}, ${model.companyName}${locked ? ', Pro plan required' : selected ? ', selected' : ''}`}
      style={({ pressed }) => [styles.row, (selected || pressed) && { backgroundColor: colors.muted }]}
    >
      <View style={[styles.rowLeft, locked && styles.locked]}>
        <ProviderLogo company={model.company} model={model.id} size={22} />
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            <Txt style={styles.modelName} numberOfLines={1}>
              {model.name}
            </Txt>
            <CostHint cost={model.cost} />
            {model.vision ? (
              <View
                style={[
                  styles.visionBadge,
                  { borderColor: colors.border, backgroundColor: selected ? colors.card : colors.muted },
                ]}
              >
                <Txt variant="label" tone="secondary" style={styles.visionText}>
                  Vision
                </Txt>
              </View>
            ) : null}
          </View>
          <Txt variant="caption" tone="secondary" numberOfLines={1}>
            {model.description}
          </Txt>
        </View>
      </View>

      {locked ? (
        <View style={[styles.proPill, { backgroundColor: colors.primary }]}>
          <Lock size={12} color={colors.primaryForeground} strokeWidth={1.75} />
          <Txt variant="label" color={colors.primaryForeground}>
            Pro
          </Txt>
        </View>
      ) : selected ? (
        <Check size={16} color={colors.foreground} strokeWidth={1.75} />
      ) : null}
    </Pressable>
  );
}

/** Bottom sheet ("M06 Model sheet") for picking 1-4 models from the live catalog. */
export function ModelPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const catalog = useAppStore((s) => s.catalog);
  const catalogStatus = useAppStore((s) => s.catalogStatus);
  const loadCatalog = useAppStore((s) => s.loadCatalog);
  const selectedModels = useAppStore((s) => s.selectedModels);
  const toggleModel = useAppStore((s) => s.toggleModel);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [prevVisible, setPrevVisible] = useState(visible);

  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setQuery('');
      setFilter('all');
    }
  }

  useEffect(() => {
    if (visible) void loadCatalog();
  }, [visible, loadCatalog]);

  const companies = useMemo(() => {
    if (!catalog) return [];
    const seen = new Map<string, string>();
    for (const m of catalog.models) {
      if (!seen.has(m.company)) seen.set(m.company, m.companyName);
    }
    return Array.from(seen, ([company, companyName]) => ({ company, companyName }));
  }, [catalog]);

  const selectedSet = useMemo(() => new Set(selectedModels), [selectedModels]);

  const filteredModels = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.models.filter((m) => {
      if (filter === 'selected' && !selectedSet.has(m.id)) return false;
      if (filter !== 'all' && filter !== 'selected' && m.company !== filter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.companyName.toLowerCase().includes(q) ||
        m.company.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    });
  }, [catalog, filter, query, selectedSet]);

  const openPricing = () => {
    onClose();
    if (Platform.OS === 'web') {
      router.push('/pricing');
      return;
    }
    setTimeout(() => router.push('/pricing'), MODAL_NAV_DELAY_MS);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      fullHeight
      title="Choose models"
      titleRight={
        <Txt variant="mono" tone="secondary">
          {selectedModels.length} of {MODEL_SELECTION_LIMITS.max} selected
        </Txt>
      }
      description="Pick one for a single answer, or several to compare side by side."
    >
      <View style={styles.body}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search models…"
          icon={Search}
          size="lg"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search models"
          trailing={
            query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <X size={16} color={colors.mutedForeground} strokeWidth={1.75} />
              </Pressable>
            ) : null
          }
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {(['selected', 'all'] as const).map((key) => {
            const active = filter === key;
            const fg = active ? colors.primaryForeground : colors.mutedForeground;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  haptic.select();
                  setFilter(key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : 'transparent' },
                  pressed && !active && { backgroundColor: colors.muted },
                ]}
              >
                {key === 'selected' ? (
                  <Star size={16} color={fg} fill={active ? fg : 'transparent'} strokeWidth={1.75} />
                ) : null}
                <Txt style={styles.chipText} color={fg}>
                  {key === 'selected' ? 'Selected' : 'All'}
                </Txt>
              </Pressable>
            );
          })}

          {companies.map((c) => {
            const active = filter === c.company;
            const fg = active ? colors.primaryForeground : colors.mutedForeground;
            return (
              <Pressable
                key={c.company}
                onPress={() => {
                  haptic.select();
                  setFilter(c.company);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.chip,
                  { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : 'transparent' },
                  pressed && !active && { backgroundColor: colors.muted },
                ]}
              >
                <ProviderLogo company={c.company} size={14} color={active ? colors.primaryForeground : colors.foreground} />
                <Txt style={styles.chipText} color={fg}>
                  {c.companyName}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listArea}>
          {catalogStatus === 'loading' && !catalog ? (
            <ModelSkeletons />
          ) : catalogStatus === 'error' && !catalog ? (
            <View style={styles.errorBox}>
              <Alert tone="danger" title="Could not load models">
                Check your connection and try again.
              </Alert>
              <Button
                label="Try again"
                variant="outline"
                size="sm"
                icon={RotateCcw}
                onPress={() => void loadCatalog({ force: true })}
              />
            </View>
          ) : (
            <FlatList
              style={styles.list}
              data={filteredModels}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.listContent, filteredModels.length === 0 && styles.listEmpty]}
              renderItem={({ item }) => {
                const selected = selectedSet.has(item.id);
                return (
                  <ModelRow
                    model={item}
                    selected={selected}
                    onPress={() => {
                      if (item.access === 'pro') {
                        haptic.select();
                        openPricing();
                        return;
                      }
                      const blocked =
                        (selected && selectedModels.length <= MODEL_SELECTION_LIMITS.min) ||
                        (!selected && selectedModels.length >= MODEL_SELECTION_LIMITS.max);
                      if (blocked) haptic.warn();
                      else haptic.select();
                      toggleModel(item.id);
                    }}
                  />
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Txt variant="callout" tone="secondary" style={styles.center}>
                    No models match your search.
                  </Txt>
                  {query || filter !== 'all' ? (
                    <Button
                      label="Reset filters"
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        setQuery('');
                        setFilter('all');
                      }}
                    />
                  ) : null}
                </View>
              }
            />
          )}
        </View>

        <View style={styles.footer}>
          <View style={[styles.promoCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.promoTile, { backgroundColor: colors.primary }]}>
              <Sparkles size={16} color={colors.primaryForeground} strokeWidth={1.75} />
            </View>
            <View style={styles.promoText}>
              <Txt variant="bodyMedium" numberOfLines={1}>
                Unlock every model
              </Txt>
              <Txt variant="caption" tone="secondary" numberOfLines={1}>
                Pro · £6.99 / month
              </Txt>
            </View>
            <Button label="Upgrade" variant="default" size="sm" onPress={openPricing} />
          </View>

          <Button label="Done" variant="secondary" fullWidth onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}

const stylesStatic = {
  cost: { flexShrink: 0 },
};

const useStyles = makeStyles(() => ({
  body: { flex: 1, minHeight: 0, gap: 12 },
  chipsScroll: { flexGrow: 0 },
  chipsContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: control.sm,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 16 },
  listArea: { flex: 1, minHeight: 0 },
  list: { flex: 1 },
  listContent: { gap: 2, paddingBottom: 4 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locked: { opacity: 0.45 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modelName: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, flexShrink: 1 },
  visionBadge: {
    height: 18,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  visionText: { fontSize: 10.5, lineHeight: 14 },
  proPill: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  skeletonList: { gap: 4 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  skeletonText: { flex: 1, gap: 6 },
  errorBox: { gap: 12, paddingVertical: 8, alignItems: 'flex-start' },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  center: { textAlign: 'center' },
  footer: { gap: 12, paddingTop: 4 },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  promoTile: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoText: { flex: 1, minWidth: 0, gap: 1 },
}));
