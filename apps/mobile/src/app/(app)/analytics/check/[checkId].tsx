import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { methodLook, money, QueryState, SectionTitle } from '@/components/analytics/parts';
import { GlassCard, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { useAnalyticsCheck } from '@/lib/analytics-api';
import { REFUND_REASONS, type RefundReason } from '@/lib/refunds-api';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';

const when = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Состав чека из аналитики: позиции, скидки, оплата, возвраты; владельцу — себестоимость и маржа. */
export default function AnalyticsCheckSheet() {
  const { checkId } = useLocalSearchParams<{ checkId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const detail = useAnalyticsCheck(checkId);
  const data = detail.data;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.xl) }]} showsVerticalScrollIndicator={false}>
      <SheetHeader title="Чек" onClose={() => router.back()} />
      <QueryState loading={!data} error={detail.error}>
        {data && (
          <>
            <View style={styles.hero}>
              <Text style={[styles.total, type.amount]}>{money(data.check.totalAmount)}</Text>
              <Text style={[type.subhead, sheetStyles.secondary]}>{when.format(new Date(data.check.closedAt ?? data.check.createdAt))}</Text>
              <Text style={[type.subhead, sheetStyles.label]}>
                {[data.player?.nickname ?? data.guestName ?? 'Гость', data.staff ? `кассир ${data.staff.nickname}` : null].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.badges}>
                {data.check.status !== 'closed' && <Badge text={data.check.status === 'open' ? 'открыт' : 'отменён'} color="#F59E0B" />}
                {data.staffComp && <Badge text="списание на персонал" color="#64748B" />}
                {data.refunds.length > 0 && <Badge text="был возврат" color="#F43F5E" />}
              </View>
            </View>

            <SectionTitle>ПОЗИЦИИ</SectionTitle>
            <GlassCard>
              {data.items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                  <View style={styles.line}>
                    <View style={styles.flex}>
                      <Text style={[type.body, sheetStyles.label]} numberOfLines={2}>
                        {item.name ?? 'Позиция'}
                      </Text>
                      <Text style={[type.footnote, sheetStyles.secondary]}>
                        {`${item.quantity} × ${money(item.priceAtTime)}${isOwner && item.lineCost > 0 ? ` · себест. ${money(item.lineCost)}` : ''}`}
                      </Text>
                    </View>
                    <Text style={[type.body, type.amount, sheetStyles.label]}>{money(item.lineTotal)}</Text>
                  </View>
                </View>
              ))}
              {data.items.length === 0 && <Text style={[type.subhead, sheetStyles.secondary, styles.pad]}>Позиций нет</Text>}
            </GlassCard>

            {(data.discounts.length > 0 || data.check.bonusUsed > 0 || data.check.certificateUsed > 0 || data.check.tipAmount > 0 || (data.check.eventBaseAmount ?? 0) > 0) && (
              <GlassCard>
                {data.discounts.map((d) => (
                  <Row key={d.id} icon="percent" label={`${d.name}${d.type === 'percent' ? ` · ${d.value}%` : ''}`} value={money(-d.amount)} />
                ))}
                {(data.check.eventBaseAmount ?? 0) > 0 && <Row icon="calendar" label="Мероприятие" value={money(data.check.eventBaseAmount ?? 0)} />}
                {data.check.bonusUsed > 0 && <Row icon="star.circle" label="Бонусы" value={money(-data.check.bonusUsed)} />}
                {data.check.certificateUsed > 0 && <Row icon="giftcard" label="Сертификат" value={money(-data.check.certificateUsed)} />}
                {data.check.tipAmount > 0 && <Row icon="heart" label="Чаевые (СБП)" value={money(data.check.tipAmount)} />}
              </GlassCard>
            )}

            {data.payments.length > 0 && (
              <>
                <SectionTitle>КАК ОПЛАЧЕНО</SectionTitle>
                <GlassCard>
                  {data.payments.map((p, index) => {
                    const look = methodLook(p.method);
                    return <Row key={`${p.method}-${index}`} icon={look.symbol} color={look.color} label={look.title} value={money(p.amount)} />;
                  })}
                </GlassCard>
              </>
            )}

            {data.refunds.length > 0 && (
              <>
                <SectionTitle>ВОЗВРАТЫ</SectionTitle>
                <GlassCard>
                  {data.refunds.map((r) => (
                    <Row
                      key={r.id}
                      icon="arrow.uturn.backward"
                      color={colors.red}
                      label={`${REFUND_REASONS[r.reason as RefundReason] ?? r.reason} · ${when.format(new Date(r.createdAt))}`}
                      caption={r.tenders?.map((t) => `${methodLook(t.method).title} ${money(t.amount)}`).join(', ')}
                      value={money(-r.totalAmount)}
                    />
                  ))}
                </GlassCard>
              </>
            )}

            {isOwner && data.costTotal > 0 && (
              <GlassCard style={styles.margin}>
                <Text style={[type.subhead, sheetStyles.secondary, styles.flex]}>{`Себестоимость ${money(data.costTotal)}`}</Text>
                <Text style={[type.headline, type.amount, sheetStyles.label]}>{`маржа ${money(data.retailTotal - data.costTotal)}`}</Text>
              </GlassCard>
            )}

            <PrimaryButton
              title="Открыть чек в кассе"
              icon="receipt"
              onPress={() => {
                router.back();
                setTimeout(() => router.push({ pathname: '/pos/[checkId]', params: { checkId: data.check.id } }), 380);
              }}
            />
          </>
        )}
      </QueryState>
    </ScrollView>
  );
}

function Row({ icon, label, value, caption, color = colors.secondaryLabel }: { icon: Parameters<typeof SymbolView>[0]['name']; label: string; value: string; caption?: string; color?: string | typeof colors.red }) {
  return (
    <View style={styles.line}>
      <SymbolView name={icon} size={16} tintColor={color} />
      <View style={styles.flex}>
        <Text style={[type.subhead, sheetStyles.label]} numberOfLines={2}>
          {label}
        </Text>
        {caption && <Text style={[type.caption1, sheetStyles.secondary]}>{caption}</Text>}
      </View>
      <Text style={[type.subhead, type.amount, sheetStyles.label]}>{value}</Text>
    </View>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}24` }]}>
      <Text style={[type.caption1, styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: space.lg },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.md },
  hero: { alignItems: 'center', gap: 2, paddingVertical: space.sm },
  total: { fontSize: 40, lineHeight: 46, color: colors.label },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontWeight: '600' },
  separator: { marginLeft: space.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 48 },
  margin: { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md },
});
