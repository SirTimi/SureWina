import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { AgentMe } from '@surewina/types';
import { api, authorized, checkApiConfiguration, SessionExpiredError } from './src/api';
import { clearSession, readSession, storeSession } from './src/session';
import { normalizeNigerianPhone } from './src/phone';
import { colors } from './src/theme';

type Screen = 'loading' | 'sign-in' | 'verify' | 'home' | 'offline';
type AgentDashboard = Awaited<ReturnType<typeof api.agents.dashboard>>;
type AgentSales = Awaited<ReturnType<typeof api.agents.sales>>;

function naira(value: number): string {
  return '₦' + (Number.isFinite(value) ? value : 0).toLocaleString('en-NG');
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>✦</Text></View>
      <Text style={[styles.brandName, inverted && styles.whiteText]}>SureWina</Text>
      <View style={styles.agentTag}><Text style={styles.agentTagText}>AGENT</Text></View>
    </View>
  );
}

function PrimaryButton({
  label, onPress, disabled = false, loading = false,
}: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && styles.disabledButton,
        pressed && styles.pressedButton,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.blueDark} /> :
        <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

function Metric({
  label, value, note,
}: {
  label: string; value: string; note?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {note ? <Text style={styles.metricNote}>{note}</Text> : null}
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentMe | null>(null);
  const [dashboard, setDashboard] = useState<AgentDashboard | null>(null);
  const [sales, setSales] = useState<AgentSales['sales']>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const hydrate = useCallback(async () => {
    const me = await authorized(() => api.agents.getMe());
    // Never display cached identity or financial figures as authoritative.
    const [summary, recent] = await Promise.all([
      authorized(() => api.agents.dashboard()),
      authorized(() => api.agents.sales(1, 4)),
    ]);
    setAgent(me.agent);
    setDashboard(summary);
    setSales(recent.sales);
  }, []);

  const restore = useCallback(async () => {
    setScreen('loading');
    setError(null);
    try {
      const stored = await readSession();
      if (!stored) {
        setScreen('sign-in');
        return;
      }
      const configurationError = checkApiConfiguration();
      if (configurationError) throw new Error(configurationError);
      await hydrate();
      setScreen('home');
    } catch (cause) {
      if (cause instanceof SessionExpiredError) {
        setScreen('sign-in');
        setError(cause.message);
        return;
      }
      setError(messageOf(cause, 'Cannot reach SureWina. Check your internet connection.'));
      setScreen('offline');
    }
  }, [hydrate]);

  useEffect(() => { void restore(); }, [restore]);

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
      setScreen('verify');
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
      await storeSession({
        accessToken: verified.accessToken,
        refreshToken: verified.refreshToken,
      });
      await hydrate();
      setScreen('home');
      setOtp('');
      setDebugOtp(null);
    } catch (cause) {
      const stored = await readSession();
      if (stored) {
        // Sign-in succeeded, but a subsequent dashboard request failed.
        setScreen('offline');
      }
      setError(messageOf(cause, 'Could not verify code. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const reloadHome = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await hydrate();
      setScreen('home');
    } catch (cause) {
      if (cause instanceof SessionExpiredError) {
        setScreen('sign-in');
      }
      setError(messageOf(cause, 'Could not refresh. Your previous figures may be outdated.'));
    } finally {
      setRefreshing(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await authorized(async () => {
        const tokens = await readSession();
        await api.agents.signOut(tokens?.refreshToken);
      });
    } catch {
      // Always clear local credentials, including when network is unavailable.
    } finally {
      await clearSession();
      setAgent(null);
      setDashboard(null);
      setSales([]);
      setError(null);
      setPhone('');
      setScreen('sign-in');
      setBusy(false);
    }
  };

  const isBusy = busy || refreshing;

  return (
    <SafeAreaProvider>
      <StatusBar style={screen === 'loading' ? 'light' : 'dark'} />
      <SafeAreaView
        style={[styles.safe, screen === 'loading' && styles.splash]}
        edges={['top', 'bottom']}
      >
        {screen === 'loading' ? (
          <View style={styles.loadingBody}>
            <Brand inverted />
            <Text style={styles.loadingCaption}>YOUR SALES. YOUR BUSINESS.</Text>
            <ActivityIndicator size="large" color={colors.yellow} style={styles.loadingSpinner} />
            <Text style={styles.loadingFooter}>Secure agent access</Text>
          </View>
        ) : null}

        {screen === 'sign-in' || screen === 'verify' ? (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              contentContainerStyle={styles.authScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Brand />
              <View style={styles.authHeading}>
                <Text style={styles.eyebrow}>SUREWINA AGENT PORTAL</Text>
                <Text style={styles.authTitle}>
                  {screen === 'sign-in' ? 'Welcome back.' : 'Verify your number.'}
                </Text>
                <Text style={styles.bodyCopy}>
                  {screen === 'sign-in'
                    ? 'Sign in using the phone number registered to your agent account.'
                    : 'Enter the 6-digit code sent to ' + normalizedPhone + '.'}
                </Text>
              </View>
              <View style={styles.authCard}>
                {screen === 'sign-in' ? (
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
                    {debugOtp ? (
                      <Text style={styles.debugInfo}>Development OTP: {debugOtp}</Text>
                    ) : null}
                    <PrimaryButton label="Verify and sign in" loading={busy} onPress={() => { void verifyCode(); }} />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => { setScreen('sign-in'); setOtp(''); setError(null); }}
                      disabled={busy}
                      style={styles.textButton}
                    >
                      <Text style={styles.textButtonLabel}>Use a different number</Text>
                    </Pressable>
                  </>
                )}
                {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              </View>
              <View style={styles.authFooter}>
                <Text style={styles.mutedCenter}>For registered agents only.</Text>
                <Text style={styles.mutedCenter}>Need access? Contact SureWina support.</Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}

        {screen === 'offline' ? (
          <View style={styles.offlineBody}>
            <Brand />
            <View style={styles.offlineIcon}><Text style={styles.offlineIconText}>!</Text></View>
            <Text style={styles.authTitle}>Connection unavailable</Text>
            <Text style={styles.bodyCopy}>Your account stays protected. We could not validate your session or load live data.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label="Retry connection" loading={isBusy} onPress={() => { void restore(); }} />
            <Pressable
              accessibilityRole="button"
              style={styles.textButton}
              onPress={() => { void signOut(); }}
            ><Text style={styles.textButtonLabel}>Sign out on this device</Text></Pressable>
          </View>
        ) : null}

        {screen === 'home' && agent && dashboard ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.homeBody}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { void reloadHome(); }} tintColor={colors.blue} />
            }
          >
            <View style={styles.homeHeading}>
              <Brand />
              <Text style={styles.agentIdentifier}>{agent.agentCode}</Text>
            </View>
            <Text style={styles.greeting}>Hello, {agent.fullName.split(' ')[0]}.</Text>
            <Text style={styles.bodyCopy}>Here is how your SureWina business is doing today.</Text>

            <View style={styles.walletHero}>
              <Text style={styles.walletEyebrow}>AVAILABLE AGENT WALLET</Text>
              <Text style={styles.walletAmount}>{naira(dashboard.wallet.availableNgn)}</Text>
              <View style={styles.walletFooter}>
                <View style={styles.walletLine} />
                <Text style={styles.walletFootnote}>Live ledger balance</Text>
              </View>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Today's overview</Text>
              <Text style={styles.sectionAside}>WAT</Text>
            </View>
            <View style={styles.metricGrid}>
              <Metric label="Gross sales" value={naira(dashboard.today.grossSalesNgn)} note="Cash collected" />
              <Metric label="Commission" value={naira(dashboard.today.commissionNgn)} note="Earned today" />
              <Metric label="Tickets sold" value={String(dashboard.today.ticketsSold)} note="Confirmed tickets" />
              <Metric label="Sales made" value={String(dashboard.today.saleCount)} note="Transactions" />
            </View>

            <View style={[styles.sellingCard, dashboard.selling.isOpen ? styles.sellingOpen : styles.sellingClosed]}>
              <View style={styles.sellingIndicator} />
              <View style={styles.sellingContent}>
                <Text style={styles.sellingTitle}>
                  {dashboard.selling.isOpen ? 'Ticket sales are open' : 'Ticket sales are currently closed'}
                </Text>
                <Text style={styles.sellingDescription}>
                  {dashboard.selling.isOpen
                    ? dashboard.selling.closesAt
                      ? 'Current draw cutoff: ' + new Date(dashboard.selling.closesAt).toLocaleString('en-NG')
                      : 'You can sell into the active draw.'
                    : 'Selling resumes once an eligible draw opens.'}
                </Text>
              </View>
            </View>

            {dashboard.legacyRemittance.totalOwedNgn > 0 ? (
              <View style={styles.legacyCard}>
                <Text style={styles.legacyTitle}>Historical balance</Text>
                <Text style={styles.legacyText}>
                  {naira(dashboard.legacyRemittance.totalOwedNgn)} from the old remittance model.
                  Current prepaid sales remain separate.
                </Text>
              </View>
            ) : null}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Recent sales</Text>
              <Pressable accessibilityRole="button" onPress={() => { void reloadHome(); }} disabled={isBusy}>
                <Text style={styles.refreshLabel}>Refresh</Text>
              </Pressable>
            </View>
            <View style={styles.salesCard}>
              {sales.length ? sales.map((sale, index) => (
                <View
                  key={sale.saleReference}
                  style={[styles.saleRow, index < sales.length - 1 && styles.saleDivider]}
                >
                  <View style={styles.saleIcon}><Text style={styles.saleIconText}>▣</Text></View>
                  <View style={styles.saleDetails}>
                    <Text style={styles.saleReference} numberOfLines={1}>{sale.saleReference}</Text>
                    <Text style={styles.saleMeta}>{sale.ticketCount} ticket(s) · {sale.buyerPhone}</Text>
                  </View>
                  <Text style={styles.saleAmount}>{naira(sale.amountNgn)}</Text>
                </View>
              )) : <Text style={styles.emptySales}>No confirmed agent sales to display yet.</Text>}
            </View>

            <View style={styles.nextPhase}>
              <Text style={styles.nextPhaseTitle}>Next: Sell tickets from your phone</Text>
              <Text style={styles.nextPhaseText}>Ticket selling, wallet top-ups and QR verification are being added in upcoming development phases. Only live, working features are active here.</Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={styles.signOutButton}
              disabled={busy}
              onPress={() => { void signOut(); }}
            >
              <Text style={styles.signOutText}>{busy ? 'Signing out…' : 'Sign out securely'}</Text>
            </Pressable>
            <Text style={styles.footerCopy}>SureWina Agent · Secure access</Text>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.paper },
  splash: { backgroundColor: colors.blueDark },
  loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingCaption: { color: '#B4C7E4', fontSize: 11, letterSpacing: 2, marginTop: 16, fontWeight: '700' },
  loadingSpinner: { marginTop: 60 },
  loadingFooter: { position: 'absolute', bottom: 34, color: '#B4C7E4', fontSize: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 32, height: 32, backgroundColor: colors.yellow, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.blueDark, fontWeight: '900', fontSize: 25 },
  brandName: { fontSize: 23, fontWeight: '800', color: colors.blueDark, letterSpacing: -0.8 },
  whiteText: { color: colors.white },
  agentTag: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: '#E8EFFB', marginLeft: 2 },
  agentTagText: { fontSize: 9, letterSpacing: 0.9, fontWeight: '800', color: colors.blue },
  authScroll: { padding: 24, paddingTop: 38, flexGrow: 1 },
  authHeading: { marginTop: 70, marginBottom: 27, gap: 11 },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.blue, letterSpacing: 1.6 },
  authTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -1.2, color: colors.blueDark },
  bodyCopy: { fontSize: 14, lineHeight: 22, color: colors.muted },
  authCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, padding: 22, borderRadius: 22, gap: 14 },
  fieldLabel: { color: colors.blueDark, fontSize: 13, fontWeight: '700' },
  input: { height: 56, backgroundColor: '#FAFBFD', borderRadius: 13, paddingHorizontal: 17, borderWidth: 1, borderColor: colors.border, fontSize: 18, color: colors.blueDark },
  otpInput: { textAlign: 'center', fontSize: 25, fontWeight: '800', letterSpacing: 8 },
  formHint: { fontSize: 12, lineHeight: 18, color: colors.muted },
  primaryButton: { height: 54, backgroundColor: colors.yellow, justifyContent: 'center', alignItems: 'center', borderRadius: 13, marginTop: 7 },
  primaryButtonText: { color: colors.blueDark, fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.6 },
  pressedButton: { opacity: 0.85 },
  error: { fontSize: 13, lineHeight: 20, color: colors.danger, marginTop: 8 },
  debugInfo: { color: colors.blueDark, backgroundColor: '#FFF9DC', padding: 10, fontSize: 13, borderRadius: 8 },
  textButton: { alignItems: 'center', padding: 12 },
  textButtonLabel: { color: colors.blue, fontSize: 13, fontWeight: '700' },
  authFooter: { marginTop: 'auto', paddingVertical: 27, gap: 5 },
  mutedCenter: { color: colors.muted, textAlign: 'center', fontSize: 12 },
  offlineBody: { flex: 1, padding: 25, justifyContent: 'center', gap: 18 },
  offlineIcon: { borderRadius: 18, backgroundColor: '#FFF0DF', width: 60, height: 60, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  offlineIconText: { fontSize: 32, color: colors.danger, fontWeight: '800' },
  homeBody: { padding: 20, paddingBottom: 50, gap: 8 },
  homeHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  agentIdentifier: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  greeting: { fontSize: 29, fontWeight: '800', letterSpacing: -1, color: colors.blueDark },
  walletHero: { marginTop: 24, marginBottom: 12, padding: 23, borderRadius: 22, backgroundColor: colors.blue, minHeight: 155 },
  walletEyebrow: { color: '#C8D8FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  walletAmount: { fontSize: 34, fontWeight: '800', color: colors.white, marginTop: 11, letterSpacing: -0.6 },
  walletFooter: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletLine: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  walletFootnote: { color: '#E1EAFE', fontSize: 12 },
  sectionHeading: { marginTop: 18, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.blueDark, fontSize: 18, fontWeight: '800' },
  sectionAside: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  metric: { width: '48%', flexGrow: 1, padding: 17, minHeight: 113, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  metricLabel: { fontSize: 12, color: colors.muted },
  metricValue: { fontSize: 23, fontWeight: '800', color: colors.blueDark, marginTop: 10 },
  metricNote: { fontSize: 11, color: colors.muted, marginTop: 5 },
  sellingCard: { padding: 16, borderRadius: 15, marginTop: 17, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sellingOpen: { backgroundColor: '#E8F7D9' },
  sellingClosed: { backgroundColor: '#FFF9DC' },
  sellingIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success, marginTop: 5 },
  sellingContent: { flex: 1, gap: 4 },
  sellingTitle: { fontWeight: '800', fontSize: 13, color: colors.blueDark },
  sellingDescription: { fontSize: 12, lineHeight: 18, color: colors.muted },
  legacyCard: { padding: 16, borderRadius: 15, backgroundColor: '#FFF9DC', marginTop: 10, gap: 5 },
  legacyTitle: { fontWeight: '800', color: colors.blueDark },
  legacyText: { fontSize: 12, lineHeight: 18, color: colors.muted },
  refreshLabel: { color: colors.blue, fontWeight: '800', fontSize: 13 },
  salesCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 17, paddingHorizontal: 15 },
  saleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 71, gap: 11 },
  saleDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  saleIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E8EFFB', alignItems: 'center', justifyContent: 'center' },
  saleIconText: { color: colors.blue, fontSize: 19 },
  saleDetails: { flex: 1, gap: 4 },
  saleReference: { fontSize: 12, fontWeight: '800', color: colors.blueDark },
  saleMeta: { fontSize: 11, color: colors.muted },
  saleAmount: { fontSize: 12, fontWeight: '800', color: colors.blueDark },
  emptySales: { fontSize: 13, color: colors.muted, padding: 20, textAlign: 'center' },
  nextPhase: { padding: 17, borderRadius: 16, marginTop: 18, gap: 5, borderWidth: 1, borderColor: '#B4C7E4' },
  nextPhaseTitle: { fontWeight: '800', fontSize: 13, color: colors.blueDark },
  nextPhaseText: { fontSize: 12, lineHeight: 18, color: colors.muted },
  signOutButton: { padding: 16, alignItems: 'center', marginTop: 23 },
  signOutText: { color: colors.danger, fontWeight: '800' },
  footerCopy: { textAlign: 'center', color: colors.muted, fontSize: 11, paddingTop: 8 },
});
