import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import { colors } from '../theme';
import { Brand, ErrorText, PrimaryButton, TextButton, shared } from '../ui';

export function LoadingScreen() {
  return (
    <SafeAreaView style={[shared.safe, styles.splash]} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.loadingBody}>
        <Brand inverted />
        <Text style={styles.loadingCaption}>YOUR SALES. YOUR BUSINESS.</Text>
        <ActivityIndicator size="large" color={colors.yellow} style={styles.loadingSpinner} />
        <Text style={styles.loadingFooter}>Secure agent access</Text>
      </View>
    </SafeAreaView>
  );
}

export function OfflineScreen() {
  const { notice, restore, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top', 'bottom']}>
      <View style={styles.offlineBody}>
        <Brand />
        <View style={styles.offlineIcon}><Text style={styles.offlineIconText}>!</Text></View>
        <Text style={shared.title}>Connection unavailable</Text>
        <Text style={shared.bodyCopy}>Your account stays protected. We could not validate your session or load live data.</Text>
        <ErrorText message={notice} />
        <PrimaryButton label="Retry connection" loading={busy} onPress={() => { void run(restore); }} />
        <TextButton label="Sign out on this device" disabled={busy} onPress={() => { void run(signOut); }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splash: { backgroundColor: colors.blueDark },
  loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingCaption: { color: '#B4C7E4', fontSize: 11, letterSpacing: 2, marginTop: 16, fontWeight: '700' },
  loadingSpinner: { marginTop: 60 },
  loadingFooter: { position: 'absolute', bottom: 34, color: '#B4C7E4', fontSize: 12 },
  offlineBody: { flex: 1, padding: 25, justifyContent: 'center', gap: 18 },
  offlineIcon: { borderRadius: 18, backgroundColor: '#FFF0DF', width: 60, height: 60, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  offlineIconText: { fontSize: 32, color: colors.danger, fontWeight: '800' },
});
