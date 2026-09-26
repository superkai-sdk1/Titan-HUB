// Чек клиента: позиции, скидки, итог, способы оплаты — в виде «бумажного» чека.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Icon, Tap } from '@/components/ui';
import { errorText } from '@/lib/api';
import { clock, longDate, money } from '@/lib/format';
import { useCheck } from '@/lib/queries';
import { colors, GUTTER, MAX_WIDTH, space, type } from '@/lib/theme';

const PAY_LABELS: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', transfer: 'Перевод', sbp: 'СБП', bonus: 'Бонусы',
  deposit: 'Депозит', debt: 'В долг', certificate: 'Сертификат', split: 'Раздельная',
};

export default function CheckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useCheck(id);
  const d = q.data;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const when = d ? (d.check.closedAt ?? d.check.createdAt) : null;
  const subtotal = d ? d.items.reduce((s, i) => s + i.lineTotal, 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + space.md : space.lg }]}>
        <Text style={type.heading}>Чек</Text>
        <Tap onPress={close} scaleTo={0.9} style={styles.close} accessibilityLabel="Закрыть">
          <Icon name="close" size={20} color={colors.textBody} />
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          {q.isLoading ? <ActivityIndicator color={colors.violetLight} style={{ marginTop: 60 }} />
            : !d ? (
              <EmptyState icon="receipt-outline" title="Чек не найден" text={q.error ? errorText(q.error) : undefined}>
                <Button title="Закрыть" variant="secondary" onPress={close} />
              </EmptyState>
            ) : (
              <View style={styles.paper}>
                <View style={styles.paperHead}>
                  <Text style={styles.brand}>TITAN</Text>
                  {when ? <Text style={type.caption}>{longDate(when)} · {clock(when)}</Text> : null}
                </View>
                <Dashed />
                {d.items.map((it, i) => (
                  <View key={i} style={styles.line}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.qty}>×{it.quantity}</Text>
                    <Text style={styles.itemSum}>{money(it.lineTotal)}</Text>
                  </View>
                ))}
                {d.discounts.length ? (
                  <>
                    <Dashed />
                    <View style={styles.line}>
                      <Text style={[styles.itemName, { color: colors.textSecondary }]}>Сумма</Text>
                      <Text style={[styles.itemSum, { color: colors.textSecondary }]}>{money(subtotal)}</Text>
                    </View>
                    {d.discounts.map((ds, i) => (
                      <View key={i} style={styles.line}>
                        <Text style={[styles.itemName, { color: colors.amber }]}>Скидка{ds.name ? ` · ${ds.name}` : ''}</Text>
                        <Text style={[styles.itemSum, { color: colors.amber }]}>−{money(ds.amount)}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
                <Dashed />
                <View style={styles.totalRow}>
                  <Text style={type.headline}>Итого</Text>
                  <Text style={styles.total}>{money(d.check.totalAmount)}</Text>
                </View>
                {(d.check.tipAmount ?? 0) > 0 ? (
                  <View style={styles.line}>
                    <Text style={[styles.itemName, { color: colors.green }]}>Чаевые</Text>
                    <Text style={[styles.itemSum, { color: colors.green }]}>+{money(d.check.tipAmount ?? 0)}</Text>
                  </View>
                ) : null}
                <View style={styles.payRow}>
                  {d.payments.map((p, i) => (
                    <View key={i} style={styles.payChip}>
                      <Text style={styles.payText}>{PAY_LABELS[p.method] ?? p.method} · {money(p.amount)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
        </View>
      </ScrollView>
    </View>
  );
}

function Dashed() {
  return <View style={styles.dashed} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, marginBottom: space.lg },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  paper: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)', padding: space.xl },
  paperHead: { alignItems: 'center', gap: 4, marginBottom: space.sm },
  brand: { color: colors.violetLight, fontSize: 16, fontWeight: '900', letterSpacing: 4 },
  dashed: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.14)', marginVertical: space.md },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, paddingVertical: 5 },
  itemName: { flex: 1, color: colors.textBody, fontSize: 14 },
  qty: { color: colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] },
  itemSum: { color: colors.textBody, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'right' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  total: { color: colors.text, fontSize: 26, fontWeight: '900', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  payChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.violetTint },
  payText: { color: colors.violetLight, fontSize: 12, fontWeight: '700' },
});
