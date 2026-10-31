import { AlertCircle, Brain } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius } from '@/constants/colors';
import { useAppStore } from '@/store';

export function AuthScreen() {
  const isAuthLoading = useAppStore((s) => s.isAuthLoading);
  const authError = useAppStore((s) => s.authError);
  const login = useAppStore((s) => s.login);
  const signup = useAppStore((s) => s.signup);
  const clearAuthError = useAppStore((s) => s.clearAuthError);

  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit =
    !isAuthLoading &&
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignUp || fullName.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (isSignUp) {
      await signup(email.trim(), password, fullName.trim());
    } else {
      await login(email.trim(), password);
    }
  };

  const toggleMode = () => {
    clearAuthError();
    setIsSignUp((prev) => !prev);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Brain size={30} color={Colors.primaryLight} />
            </View>
            <Text style={styles.title}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? 'Join the Multi-Agent Council and consult 3 AI models at once.'
                : 'Welcome back. Sign in to continue to the Multi-Agent Council.'}
            </Text>

            {authError ? (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color={Colors.error} />
                <Text style={styles.errorText}>{authError}</Text>
              </View>
            ) : null}

            {isSignUp ? (
              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Jane Doe"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                  autoComplete="name"
                  editable={!isAuthLoading}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                editable={!isAuthLoading}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                editable={!isAuthLoading}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
              />
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitDisabled,
                pressed && canSubmit && styles.submitPressed,
              ]}
            >
              {isAuthLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
              )}
            </Pressable>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleHint}>
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              </Text>
              <Pressable onPress={toggleMode} disabled={isAuthLoading} hitSlop={8}>
                <Text style={styles.toggleLink}>{isSignUp ? 'Sign in' : 'Create account'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.errorBg,
    borderColor: Colors.errorBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { color: Colors.error, fontSize: 13, flex: 1 },
  field: { marginBottom: 14 },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  submit: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitDisabled: { opacity: 0.5 },
  submitPressed: { opacity: 0.85 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  toggleHint: { color: Colors.textSecondary, fontSize: 13 },
  toggleLink: { color: Colors.primaryLight, fontSize: 13, fontWeight: '600' },
});
