import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth } from '../auth';
import { colors } from '../theme';
import { TextButton, shared } from '../ui';

// Who is signed in on this terminal, the app version (for support calls),
// and sign-out.
export function MoreScreen() {
  const { agent, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const version = Constants.expoConfig?.version ?? 'unknown';

  const rows: Array<[string, string]> = agent
    ? [
        ['Name', agent.fullName],
        ['Agent code', agent.agentCode],
        ['Phone', agent.phoneNumber],
        ['State', agent.registeredStateCode],
        ['Status', agent.status.charAt(0) + agent.status.slice(1).replace('_', ' ').toLowerCase()],
      ]
    : [];

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={shared.eyebrow}>ACCOUNT</Text>
        <Text style={styles.title}>This terminal</Text>
        <View style={[shared.card, styles.list]}>
          {rows.map(([label, value], index) => (
            <View key={label} style={[styles.row, index < rows.length - 1 && styles.divider]}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value} numberOfLines={1}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.signOut}>
          <TextButton
            label={busy ? 'Signing out…' : 'Sign out securely'}
            danger
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void signOut().finally(() => setBusy(false));
            }}
          />
        </View>
        <Text style={styles.footer}>SureWina Agent · version {version}</Text>
        <Text style={styles.footer}>Need help? Contact SureWina support.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40, gap: 8 },
  title: { fontSize: 29, fontWeight: '800', letterSpacing: -1, color: colors.blueDark, marginBottom: 12 },
  list: { paddingVertical: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: 13, color: colors.muted },
  value: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: colors.blueDark },
  signOut: { marginTop: 24 },
  footer: { textAlign: 'center', color: colors.muted, fontSize: 11, paddingTop: 4 },
});
