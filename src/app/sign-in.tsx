import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type TextInputInstance } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoTile } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Card } from '@/components/ui/layout';
import { TextField } from '@/components/ui/text-field';
import { Txt } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { fonts, makeStyles } from '@/theme';

type Mode = 'signin' | 'signup';

/** shadcn login card: logo tile, title, labelled inputs, one primary action. */
export default function SignInScreen() {
  const styles = useStyles();
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
            <View style={styles.brand}>
              <LogoTile size={40} />
              <Txt style={styles.brandName}>Council</Txt>
            </View>

            <Card style={styles.card}>
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
                    label="Full name"
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    size="lg"
                  />
                </Animated.View>
              ) : null}

              <Animated.View layout={LinearTransition.springify().damping(20)} style={styles.fields}>
                <TextField
                  ref={emailRef}
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  size="lg"
                />
                <TextField
                  ref={passwordRef}
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignUp ? 'At least 8 characters' : '••••••••'}
                  secure
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  size="lg"
                />

                {error ? (
                  <Animated.View entering={FadeIn.duration(180)}>
                    <Alert>{error}</Alert>
                  </Animated.View>
                ) : null}

                <Button
                  label={isSignUp ? 'Create account' : 'Log in'}
                  size="lg"
                  fullWidth
                  loading={busy}
                  disabled={!canSubmit}
                  onPress={submit}
                  style={styles.submit}
                />
              </Animated.View>
            </Card>

            <View style={styles.switchRow}>
              <Txt variant="callout" tone="secondary">
                {isSignUp ? 'Already have an account?' : 'Don’t have an account?'}
              </Txt>
              <Pressable onPress={switchMode} hitSlop={8} accessibilityRole="button">
                <Txt variant="calloutMedium" style={styles.switchLink}>
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
  safe: { flex: 1, backgroundColor: c.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 32 },
  column: { gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  brandName: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.36, color: c.foreground },
  card: { padding: 20, gap: 20 },
  heading: { gap: 6 },
  center: { textAlign: 'center' },
  fields: { gap: 16 },
  submit: { marginTop: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  switchLink: { textDecorationLine: 'underline', color: c.foreground },
}));
