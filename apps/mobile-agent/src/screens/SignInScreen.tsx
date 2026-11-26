import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, checkApiConfiguration } from '../api';
import { useAuth } from '../auth';
import { messageOf } from '../format';
import { normalizeNigerianPhone } from '../phone';
import { colors } from '../theme';
import { Brand, ErrorText, PrimaryButton, TextButton, shared } from '../ui';

// Phone number, then the 6-digit code.
export function SignInScreen() {
  const { notice, completeSignIn } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(notice);
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    const number = normalizeNigerianPhone(phone);
    if (!number) {
      setError('Enter a valid Nigerian mobile number, such as 08012345678.');
      return;
    }
    const configurationError = checkApiConfiguration();
    if (configurationError) {
      setError(configurationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challenge = await api.agents.requestOtp({ phoneE164: number });
      setNormalizedPhone(number);
      setChallengeId(challenge.challengeId);
      setDebugOtp(__DEV__ ? challenge.debugOtp ?? null : null);
      setOtp('');
      setStep('code');
    } catch (cause) {
      setError(messageOf(cause, 'Could not request an OTP. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code sent to your phone.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const verified = await api.agents.verifyOtp({ challengeId, otp });
      await completeSignIn({ accessToken: verified.accessToken, refreshToken: verified.refreshToken });
    } catch (cause) {
      setError(messageOf(cause, 'Could not verify code. Try again.'));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={shared.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <Brand />
          <View style={styles.authHeading}>
            <Text style={shared.eyebrow}>SUREWINA AGENT PORTAL</Text>
            <Text style={shared.title}>{step === 'phone' ? 'Welcome back.' : 'Verify your number.'}</Text>
            <Text style={shared.bodyCopy}>
              {step === 'phone'
                ? 'Sign in using the phone number registered to your agent account.'
                : 'Enter the 6-digit code sent to ' + normalizedPhone + '.'}
            </Text>
          </View>
          <View style={styles.authCard}>
            {step === 'phone' ? (
              <>
                <Text style={styles.fieldLabel}>Registered phone number</Text>
                <TextInput
                  accessibilityLabel="Registered phone number"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  placeholder="0801 234 5678"
                  placeholderTextColor="#999EA7"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={18}
                  editable={!busy}
                  style={styles.input}
                />
                <Text style={styles.formHint}>We will send an OTP to verify your identity.</Text>
                <PrimaryButton label="Send verification code" loading={busy} onPress={() => { void requestCode(); }} />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Verification code</Text>
                <TextInput
                  accessibilityLabel="Six digit verification code"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  placeholderTextColor="#999EA7"
                  value={otp}
                  onChangeText={(text) => setOtp(text.replace(/\D/g, ''))}
                  maxLength={6}
                  editable={!busy}
                  style={[styles.input, styles.otpInput]}
                />
                {debugOtp ? <Text style={styles.debugInfo}>Development OTP: {debugOtp}</Text> : null}
                <PrimaryButton label="Verify and sign in" loading={busy} onPress={() => { void verifyCode(); }} />
                <TextButton
                  label="Use a different number"
                  disabled={busy}
                  onPress={() => { setStep('phone'); setOtp(''); setError(null); }}
                />
              </>
            )}
            <ErrorText message={error} />
          </View>
          <View style={styles.authFooter}>
            <Text style={styles.mutedCenter}>For registered agents only.</Text>
            <Text style={styles.mutedCenter}>Need access? Contact SureWina support.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authScroll: { padding: 24, paddingTop: 38, flexGrow: 1 },
  authHeading: { marginTop: 70, marginBottom: 27, gap: 11 },
  authCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, padding: 22, borderRadius: 22, gap: 14 },
  fieldLabel: { color: colors.blueDark, fontSize: 13, fontWeight: '700' },
  input: { height: 56, backgroundColor: '#FAFBFD', borderRadius: 13, paddingHorizontal: 17, borderWidth: 1, borderColor: colors.border, fontSize: 18, color: colors.blueDark },
  otpInput: { textAlign: 'center', fontSize: 25, fontWeight: '800', letterSpacing: 8 },
  formHint: { fontSize: 12, lineHeight: 18, color: colors.muted },
  debugInfo: { color: colors.blueDark, backgroundColor: '#FFF9DC', padding: 10, fontSize: 13, borderRadius: 8 },
  authFooter: { marginTop: 'auto', paddingVertical: 27, gap: 5 },
  mutedCenter: { color: colors.muted, textAlign: 'center', fontSize: 12 },
});
