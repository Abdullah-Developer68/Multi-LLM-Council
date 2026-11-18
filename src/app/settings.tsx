import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Cpu, Layers, LogOut, Monitor, Moon, ShieldOff, Sparkles, Sun, Vibrate } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { InsightsPanel } from '@/components/insights-panel';
import { AppHeader, BackButton, Screen } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Segmented, Toggle } from '@/components/ui/controls';
import { Badge, Card, Divider, ListGroup, ListItem, SectionHeader } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import { Txt } from '@/components/ui/text';
import { initials } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { navigateTo } from '@/lib/nav';
import { useAppStore } from '@/store';
import type { ThemePreference } from '@/theme/tokens';
import { makeStyles, radius, useTheme } from '@/theme';

const enter = (i: number) => FadeInDown.delay(40 + i * 60).springify().damping(20);

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const user = useAppStore((s) => s.user);
  const updateName = useAppStore((s) => s.updateName);
  const signOut = useAppStore((s) => s.signOut);
  const showToast = useAppStore((s) => s.showToast);
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const hapticsEnabled = useAppStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useAppStore((s) => s.setHapticsEnabled);
  const contextEnabled = useAppStore((s) => s.contextEnabled);
  const setContextEnabled = useAppStore((s) => s.setContextEnabled);

  const [name, setName] = useState(user?.fullName ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const dirty = !!name.trim() && name.trim() !== user?.fullName;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const onRefreshComplete = useCallback(() => {
    setRefreshing(false);
  }, []);

  const saveName = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await updateName(name.trim());
      haptic.success();
      showToast('Name updated', 'success');
    } catch (err) {
      showToast((err as Error).message || 'Could not update your name.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const memberSince = user ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';

  return (
    <Screen
      header={
        <AppHeader
          title="Settings"
          leading={<BackButton />}
          trailing={
            dirty ? (
              <Pressable onPress={saveName} hitSlop={8} accessibilityRole="button" style={styles.save}>
                <Txt variant="bodyMedium" style={styles.saveText} tone={saving ? 'secondary' : 'primary'}>
                  {saving ? 'Saving…' : 'Save'}
                </Txt>
              </Pressable>
            ) : null
          }
        />
      }
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Animated.View entering={enter(0)}>
          <Card padded={false}>
            <View style={styles.profile}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Txt variant="title" color={colors.primaryForeground}>
                  {initials(user?.fullName, user?.email)}
                </Txt>
              </View>
              <View style={styles.flex}>
                <Txt variant="headline" numberOfLines={1}>
                  {user?.fullName ?? 'Account'}
                </Txt>
                <Txt variant="callout" tone="secondary" numberOfLines={1}>
                  {user?.email}
                </Txt>
                {memberSince ? (
                  <Txt variant="caption" tone="tertiary">
                    Member since {memberSince}
                  </Txt>
                ) : null}
              </View>
            </View>
            <Divider />
            <View style={styles.nameField}>
              <TextField
                label="Display name"
                value={name}
                onChangeText={setName}
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={saveName}
                size="lg"
              />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={enter(1)}>
          <SectionHeader title="Plan" />
          <Card style={styles.planCard}>
            <View style={styles.planTop}>
              <View style={styles.planHeader}>
                <Txt variant="headline">Free plan</Txt>
                <Badge label="Current" variant="secondary" />
              </View>
              <Txt variant="caption" tone="secondary">
                Up to 4 free models · prompt refiner · consensus on demand
              </Txt>
            </View>
            <Button label="Upgrade to Pro" icon={Sparkles} fullWidth onPress={() => router.push('/pricing')} />
          </Card>
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <SectionHeader title="Appearance" />
          <Segmented<ThemePreference>
            variant="tabs"
            value={themePreference}
            onChange={setThemePreference}
            options={[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Monitor },
            ]}
          />
        </Animated.View>

        <Animated.View entering={enter(3)}>
          <SectionHeader title="Council" />
          <ListGroup>
            <ListItem
              icon={Layers}
              title="Conversation memory"
              trailing={<Toggle value={contextEnabled} onChange={setContextEnabled} label="Conversation memory" />}
            />
            {Platform.OS !== 'web' ? (
              <ListItem
                icon={Vibrate}
                title="Haptic feedback"
                trailing={<Toggle value={hapticsEnabled} onChange={setHapticsEnabled} label="Haptic feedback" />}
              />
            ) : null}
            <ListItem icon={Cpu} title="Model status" value="Free tier" onPress={() => navigateTo('/settings', '/council')} />
          </ListGroup>
          <Txt variant="caption" tone="secondary" style={styles.footnote}>
            Memory sends a summary of the last three turns with each follow-up so the council keeps context.
          </Txt>
        </Animated.View>

        <Animated.View entering={enter(4)}>
          <SectionHeader title="Insights" />
          <InsightsPanel refreshKey={refreshKey} onRefreshComplete={onRefreshComplete} />
        </Animated.View>

        <Animated.View entering={enter(5)}>
          <ListGroup>
            <ListItem icon={LogOut} title="Sign out" onPress={() => signOut()} />
            <ListItem title="Sign out of all devices" destructive onPress={() => setConfirmEverywhere(true)} />
          </ListGroup>
          {confirmEverywhere ? (
            <Animated.View entering={FadeIn.duration(160)} style={[styles.confirm, { backgroundColor: colors.destructiveSoft }]}>
              <View style={styles.confirmText}>
                <ShieldOff size={16} color={colors.destructive} strokeWidth={1.75} />
                <Txt variant="callout" tone="danger" style={styles.flex}>
                  This ends every session, including this one. You will need to log in again on each device.
                </Txt>
              </View>
              <View style={styles.confirmButtons}>
                <Button label="Cancel" variant="outline" size="sm" onPress={() => setConfirmEverywhere(false)} />
                <Button label="Sign out everywhere" variant="destructive" size="sm" onPress={() => signOut({ everywhere: true })} />
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>

        <Txt variant="label" tone="tertiary" style={styles.version}>
          Council v{Constants.expoConfig?.version ?? '2.0.0'} · Expo SDK 58
        </Txt>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  scroll: { padding: 16, gap: 24, paddingBottom: 48 },
  save: { paddingHorizontal: 10, height: 40, justifyContent: 'center' },
  saveText: { fontSize: 15 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  nameField: { padding: 16 },
  planCard: { gap: 16 },
  planTop: { gap: 4 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  footnote: { marginTop: 8, paddingHorizontal: 4 },
  confirm: { gap: 12, padding: 14, borderRadius: radius.lg, marginTop: 12 },
  confirmText: { flexDirection: 'row', gap: 10 },
  confirmButtons: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  version: { textAlign: 'center' },
}));
