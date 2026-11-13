import Constants from 'expo-constants';
import { LogOut, Monitor, Moon, ShieldOff, Sun } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Segmented, Toggle } from '@/components/ui/controls';
import { Card, Divider, ScreenHeader, SectionHeader } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import { MonoLabel, Txt } from '@/components/ui/text';
import { initials } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import type { ThemePreference } from '@/theme/tokens';
import { makeStyles, useTheme } from '@/theme';

const enter = (i: number) => FadeInDown.delay(40 + i * 60).springify().damping(20);

function ToggleRow({
  title,
  body,
  value,
  onChange,
}: {
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Txt variant="calloutMedium">{title}</Txt>
        <Txt variant="caption" tone="secondary">
          {body}
        </Txt>
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  );
}

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
  const dirty = name.trim() && name.trim() !== user?.fullName;

  const saveName = async () => {
    if (!dirty) return;
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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View entering={enter(0)} style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Txt variant="title" color={colors.onPrimary}>
              {initials(user?.fullName, user?.email)}
            </Txt>
          </View>
          <View style={styles.flex}>
            <Txt variant="headline" numberOfLines={1}>
              {user?.fullName}
            </Txt>
            <Txt variant="callout" tone="secondary" numberOfLines={1}>
              {user?.email}
            </Txt>
            {memberSince ? <MonoLabel style={styles.since}>Member since {memberSince}</MonoLabel> : null}
          </View>
        </Animated.View>

        <Animated.View entering={enter(1)}>
          <SectionHeader index="01" title="Profile" />
          <Card style={styles.gap}>
            <TextField label="Display name" value={name} onChangeText={setName} maxLength={80} returnKeyType="done" onSubmitEditing={saveName} />
            {dirty ? (
              <Animated.View entering={FadeIn.duration(160)} style={styles.right}>
                <Button label="Save name" size="sm" loading={saving} onPress={saveName} />
              </Animated.View>
            ) : null}
          </Card>
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <SectionHeader index="02" title="Appearance" />
          <Card style={styles.gap}>
            <Segmented<ThemePreference>
              value={themePreference}
              onChange={setThemePreference}
              options={[
                { value: 'system', label: 'System', icon: Monitor },
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
              ]}
            />
            <Txt variant="caption" tone="tertiary">
              System follows your device. Your choice is saved on this device.
            </Txt>
          </Card>
        </Animated.View>

        <Animated.View entering={enter(3)}>
          <SectionHeader index="03" title="Council" />
          <Card padded={false}>
            <ToggleRow
              title="Conversation memory"
              body="Send a summary of the last three turns with each follow-up so the council keeps context."
              value={contextEnabled}
              onChange={setContextEnabled}
            />
            {Platform.OS !== 'web' ? (
              <>
                <Divider inset={16} />
                <ToggleRow
                  title="Haptic feedback"
                  body="Subtle taps when you send, swipe between seats, or vote."
                  value={hapticsEnabled}
                  onChange={setHapticsEnabled}
                />
              </>
            ) : null}
          </Card>
        </Animated.View>

        <Animated.View entering={enter(4)}>
          <SectionHeader index="04" title="Account" />
          <Card style={styles.gap}>
            <Button label="Sign out" variant="secondary" icon={LogOut} fullWidth onPress={() => signOut()} />
            {confirmEverywhere ? (
              <Animated.View entering={FadeIn.duration(160)} style={styles.gap}>
                <Txt variant="caption" tone="secondary">
                  This signs you out on every device, including this one.
                </Txt>
                <View style={styles.row}>
                  <Button label="Cancel" variant="secondary" size="sm" onPress={() => setConfirmEverywhere(false)} />
                  <Button label="Sign out everywhere" variant="danger" size="sm" onPress={() => signOut({ everywhere: true })} />
                </View>
              </Animated.View>
            ) : (
              <Button
                label="Sign out of all devices"
                variant="ghost"
                icon={ShieldOff}
                fullWidth
                onPress={() => setConfirmEverywhere(true)}
              />
            )}
          </Card>
        </Animated.View>

        <MonoLabel style={styles.version}>
          Council v{Constants.expoConfig?.version ?? '2.0.0'} · Expo SDK 58
        </MonoLabel>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 20, gap: 28, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  since: { marginTop: 6 },
  gap: { gap: 12 },
  right: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', gap: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  version: { textAlign: 'center' },
  flex: { flex: 1 },
}));
