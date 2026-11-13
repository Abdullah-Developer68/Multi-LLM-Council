import { Lock, Mail, User } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type TextInputInstance } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { TextField } from '@/components/ui/text-field';
import { Headline, MonoLabel, Txt } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { makeStyles, radius, useTheme } from '@/theme';

type Mode = 'signin' | 'signup';

const PILLARS = [
  { index: '01', title: 'Peer-refined prompts', body: 'Each model writes the brief for the next one.' },
  { index: '02', title: 'Three answers, streamed', body: 'Watch every seat think in parallel.' },
  { index: '03', title: 'One consensus', body: 'Reconcile the council into a single verdict.' },
];

function enter(i: number) {
  return FadeInDown.delay(80 + i * 70)
    .springify()
    .damping(20);
}

export default function SignInScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const signIn = useAppStore((s) => s.signIn);
  const signUp = useAppStore((s) => s.signUp);

  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const isSignUp = mode === 'signup';
  const canSubmit = email.trim() && password && (!isSignUp || fullName.trim());

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isSignUp) await signUp(email.trim(), password, fullName.trim());
      else await signIn(email.trim(), password);
      haptic.success();
    } catch (err) {
      haptic.warn();
      setError((err as Error).message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            <Animated.View entering={enter(0)}>
              <Wordmark size={22} />
            </Animated.View>

            <Animated.View entering={enter(1)} style={styles.hero}>
              <Headline muted="Ask once." strong="Three models answer." />
              <Txt tone="secondary" style={styles.lede}>
                Every prompt is refined by a peer model, answered by three free frontier models in parallel, and
                reconciled into a single verdict.
              </Txt>
            </Animated.View>

            <Animated.View entering={enter(2)} style={styles.form} layout={LinearTransition.springify().damping(20)}>
              <Segmented
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setError(null);
                }}
                options={[
                  { value: 'signin', label: 'Sign in' },
                  { value: 'signup', label: 'Create account' },
                ]}
              />

              {isSignUp ? (
                <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
                  <TextField
                    label="Name"
                    icon={User}
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                  />
                </Animated.View>
              ) : null}

              <Animated.View layout={LinearTransition.springify().damping(20)} style={styles.fields}>
                <TextField
                  ref={emailRef}
                  label="Email"
                  icon={Mail}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@company.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <TextField
                  ref={passwordRef}
                  label="Password"
                  icon={Lock}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
                  secure
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />

                {error ? (
                  <Animated.View
                    entering={FadeIn.duration(180)}
                    style={[styles.error, { backgroundColor: colors.dangerSoft }]}
                    accessibilityRole="alert"
                  >
                    <Txt variant="callout" tone="danger">
                      {error}
                    </Txt>
                  </Animated.View>
                ) : null}

                <Button
                  label={isSignUp ? 'Create account' : 'Sign in'}
                  size="lg"
                  fullWidth
                  loading={busy}
                  disabled={!canSubmit}
                  onPress={submit}
                />
              </Animated.View>
            </Animated.View>

            <Animated.View entering={enter(3)} style={styles.pillars}>
              {PILLARS.map((p, i) => (
                <View key={p.index} style={[styles.pillar, i > 0 && styles.pillarBorder]}>
                  <MonoLabel>[ {p.index} ]</MonoLabel>
                  <Txt variant="calloutMedium" style={styles.pillarTitle}>
                    {p.title}
                  </Txt>
                  <Txt variant="caption" tone="secondary">
                    {p.body}
                  </Txt>
                </View>
              ))}
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 28 },
  column: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 28, flexGrow: 1 },
  hero: { gap: 14, marginTop: 20 },
  lede: { maxWidth: 380 },
  form: { gap: 16 },
  fields: { gap: 14 },
  error: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  pillars: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderColor: c.border,
    flexDirection: 'row',
  },
  pillar: { flex: 1, paddingTop: 14, paddingRight: 10, gap: 4 },
  pillarBorder: { borderLeftWidth: 1, borderColor: c.border, paddingLeft: 10 },
  pillarTitle: { marginTop: 6 },
}));
