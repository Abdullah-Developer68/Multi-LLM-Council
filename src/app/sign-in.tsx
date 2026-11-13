import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type TextInputInstance } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Txt } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { makeStyles, radius, useTheme } from '@/theme';

type Mode = 'signin' | 'signup';

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

  const switchMode = () => {
    haptic.select();
    setMode(isSignUp ? 'signin' : 'signup');
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.column} layout={LinearTransition.springify().damping(20)}>
            <View style={styles.logo}>
              <LogoMark size={38} />
            </View>
            <Animated.View key={mode} entering={FadeIn.duration(220)} style={styles.heading}>
              <Txt variant="title" style={styles.center}>
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </Txt>
              <Txt tone="secondary" style={styles.center}>
                {isSignUp ? 'Three AI models, one conversation. Free to use.' : 'Log in to continue your conversations.'}
              </Txt>
            </Animated.View>

            {isSignUp ? (
              <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)}>
                <TextField
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Full name"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  accessibilityLabel="Full name"
                />
              </Animated.View>
            ) : null}

            <Animated.View layout={LinearTransition.springify().damping(20)} style={styles.fields}>
              <TextField
                ref={emailRef}
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                accessibilityLabel="Email address"
              />
              <TextField
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder={isSignUp ? 'Password (8+ characters)' : 'Password'}
                secure
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                textContentType={isSignUp ? 'newPassword' : 'password'}
                returnKeyType="go"
                onSubmitEditing={submit}
                accessibilityLabel="Password"
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

              <Button label="Continue" size="lg" fullWidth loading={busy} disabled={!canSubmit} onPress={submit} />
            </Animated.View>

            <View style={styles.switchRow}>
              <Txt variant="callout" tone="secondary">
                {isSignUp ? 'Already have an account?' : 'Don’t have an account?'}
              </Txt>
              <Pressable onPress={switchMode} hitSlop={8} accessibilityRole="button">
                <Txt variant="calloutMedium" tone="accent">
                  {isSignUp ? 'Log in' : 'Sign up'}
                </Txt>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  column: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: 16 },
  logo: { alignItems: 'center', marginBottom: 8 },
  heading: { gap: 8, marginBottom: 12 },
  center: { textAlign: 'center' },
  fields: { gap: 14 },
  error: { borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
}));
