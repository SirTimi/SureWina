import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>✦</Text></View>
      <Text style={[styles.brandName, inverted && styles.whiteText]}>SureWina</Text>
      <View style={styles.agentTag}><Text style={styles.agentTagText}>AGENT</Text></View>
    </View>
  );
}

export function PrimaryButton({
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

export function TextButton({
  label, onPress, disabled = false, danger = false,
}: {
  label: string; onPress: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.textButton}>
      <Text style={[styles.textButtonLabel, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

export function Metric({
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

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null;
}

export const shared = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.paper },
  eyebrow: { fontSize: 11, fontWeight: '800', color: colors.blue, letterSpacing: 1.6 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -1.2, color: colors.blueDark },
  bodyCopy: { fontSize: 14, lineHeight: 22, color: colors.muted },
  sectionHeading: { marginTop: 18, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.blueDark, fontSize: 18, fontWeight: '800' },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 16 },
});

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 32, height: 32, backgroundColor: colors.yellow, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.blueDark, fontWeight: '900', fontSize: 25 },
  brandName: { fontSize: 23, fontWeight: '800', color: colors.blueDark, letterSpacing: -0.8 },
  whiteText: { color: colors.white },
  agentTag: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: '#E8EFFB', marginLeft: 2 },
  agentTagText: { fontSize: 9, letterSpacing: 0.9, fontWeight: '800', color: colors.blue },
  primaryButton: { height: 54, backgroundColor: colors.yellow, justifyContent: 'center', alignItems: 'center', borderRadius: 13, marginTop: 7 },
  primaryButtonText: { color: colors.blueDark, fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.6 },
  pressedButton: { opacity: 0.85 },
  textButton: { alignItems: 'center', padding: 12 },
  textButtonLabel: { color: colors.blue, fontSize: 13, fontWeight: '700' },
  dangerText: { color: colors.danger, fontWeight: '800' },
  metric: { width: '48%', flexGrow: 1, padding: 17, minHeight: 113, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  metricLabel: { fontSize: 12, color: colors.muted },
  metricValue: { fontSize: 23, fontWeight: '800', color: colors.blueDark, marginTop: 10 },
  metricNote: { fontSize: 11, color: colors.muted, marginTop: 5 },
  error: { fontSize: 13, lineHeight: 20, color: colors.danger, marginTop: 8 },
});
