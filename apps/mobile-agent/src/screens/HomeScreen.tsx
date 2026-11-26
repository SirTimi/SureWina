import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api, authorized, SessionExpiredError } from '../api';
import { useAuth } from '../auth';
import { messageOf, naira } from '../format';
import { colors } from '../theme';
import { Brand, ErrorText, Metric, shared } from '../ui';

type AgentDashboard = Awaited<ReturnType<typeof api.agents.dashboard>>;
type AgentSales = Awaited<ReturnType<typeof api.agents.sales>>;

export function HomeScreen() {
  const { agent, expire } = useAuth();
  const [dashboard, setDashboard] = useState<AgentDashboard | null>(null);
  const [sales, setSales] = useState<AgentSales['sales']>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      // Never display cached financial figures as authoritative.
      const [summary, recent] = await Promise.all([
        authorized(() => api.agents.dashboard()),
        authorized(() => api.agents.sales(1, 4)),
      ]);
      setDashboard(summary);
      setSales(recent.sales);
    } catch (cause) {
      if (cause instanceof SessionExpiredError) {
        expire(cause.message);
        return;
      }
      setError(messageOf(cause, 'Could not refresh. Your previous figures may be outdated.'));
    } finally {
      setRefreshing(false);
    }
  }, [expire]);

  // Fresh figures every time the agent comes back to this tab.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!agent) return null;

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView
        style={shared.flex}
        contentContainerStyle={styles.homeBody}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(); }} tintColor={colors.blue} />}
      >
        <View style={styles.homeHeading}>
          <Brand />
          <Text style={styles.agentIdentifier}>{agent.agentCode}</Text>
        </View>
        <Text style={styles.greeting}>Hello, {agent.fullName.split(' ')[0]}.</Text>
        <Text style={shared.bodyCopy}>Here is how your SureWina business is doing today.</Text>

        {!dashboard ? (
          <View style={styles.firstLoad}>
            {refreshing ? <ActivityIndicator color={colors.blue} /> : null}
            <ErrorText message={error} />
          </View>
        ) : (
          <>
            <View style={styles.walletHero}>
              <Text style={styles.walletEyebrow}>AVAILABLE AGENT WALLET</Text>
              <Text style={styles.walletAmount}>{naira(dashboard.wallet.availableNgn)}</Text>
              <View style={styles.walletFooter}>
                <View style={styles.walletLine} />
                <Text style={styles.walletFootnote}>Live ledger balance</Text>
              </View>
            </View>

            <View style={shared.sectionHeading}>
              <Text style={shared.sectionTitle}>Today's overview</Text>
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

            <View style={shared.sectionHeading}>
              <Text style={shared.sectionTitle}>Recent sales</Text>
              <Pressable accessibilityRole="button" onPress={() => { void load(); }} disabled={refreshing}>
                <Text style={styles.refreshLabel}>Refresh</Text>
              </Pressable>
            </View>
            <View style={styles.salesCard}>
              {sales.length ? sales.map((sale, index) => (
                <View key={sale.saleReference} style={[styles.saleRow, index < sales.length - 1 && styles.saleDivider]}>
                  <View style={styles.saleIcon}><Text style={styles.saleIconText}>▣</Text></View>
                  <View style={styles.saleDetails}>
                    <Text style={styles.saleReference} numberOfLines={1}>{sale.saleReference}</Text>
                    <Text style={styles.saleMeta}>{sale.ticketCount} ticket(s) · {sale.buyerPhone}</Text>
                  </View>
                  <Text style={styles.saleAmount}>{naira(sale.amountNgn)}</Text>
                </View>
              )) : <Text style={styles.emptySales}>No confirmed agent sales to display yet.</Text>}
            </View>
            <ErrorText message={error} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  homeBody: { padding: 20, paddingBottom: 40, gap: 8 },
  homeHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  agentIdentifier: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  greeting: { fontSize: 29, fontWeight: '800', letterSpacing: -1, color: colors.blueDark },
  firstLoad: { paddingVertical: 40, alignItems: 'center' },
  walletHero: { marginTop: 24, marginBottom: 12, padding: 23, borderRadius: 22, backgroundColor: colors.blue, minHeight: 155 },
  walletEyebrow: { color: '#C8D8FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  walletAmount: { fontSize: 34, fontWeight: '800', color: colors.white, marginTop: 11, letterSpacing: -0.6 },
  walletFooter: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletLine: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  walletFootnote: { color: '#E1EAFE', fontSize: 12 },
  sectionAside: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
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
});
