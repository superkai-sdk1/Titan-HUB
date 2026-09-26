// «Бонусная программа»: как начисляются и тратятся бонусы, когда сгорают, статус.
import { useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Icon, IconBubble, type IconName, Tap } from '@/components/ui';
import { bonus, inDays, longDate, money, plural } from '@/lib/format';
import { useWallet } from '@/lib/queries';
import { colors, GUTTER, MAX_WIDTH, space, type } from '@/lib/theme';

export default function BonusRulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: w } = useWallet();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const r = w?.bonusRules;

  const rules: { icon: IconName; color: string; title: string; text: string }[] = r ? [
    {
      icon: 'star', color: '#FACC15', title: `${r.accrualPercent}% бонусами с каждого чека`,
      text: r.minPurchase > 0 ? `За покупки от ${money(r.minPurchase)}. 1 бонус = 1 ₽.` : 'Начисляются после оплаты чека. 1 бонус = 1 ₽.',
    },
    {
      icon: 'sparkles', color: colors.pink, title: 'Оплачивайте бонусами',
      text: r.maxSpendPercent ? `Бонусами можно оплатить до ${r.maxSpendPercent}% чека — скажите об этом на кассе.` : 'Скажите на кассе, что хотите оплатить бонусами.',
    },
    {
      icon: 'hourglass', color: colors.amber, title: r.expiryDays ? `Сгорают через ${r.expiryDays} ${plural(r.expiryDays, 'день', 'дня', 'дней')}` : 'Не сгорают',
      text: r.expiryDays ? 'Каждое начисление живёт своё время — сначала тратятся те, что сгорят раньше.' : 'Бонусы копятся без срока.',
    },
    {
      icon: 'trophy', color: colors.violetLight, title: 'Статус «Резидент»',
      text: `После ${w?.visitProgress.threshold ?? 10} посещений клуба — больше привилегий и участие в фонде клуба.`,
    },
  ] : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + space.md : space.lg }]}>
        <Text style={type.heading}>Бонусная программа</Text>
        <Tap onPress={close} scaleTo={0.9} style={styles.close} accessibilityLabel="Закрыть">
          <Icon name="close" size={20} color={colors.textBody} />
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space.xxl }}>
        <View style={styles.column}>
          {w && !w.bonusHidden ? (
            <Card tone={colors.violet} style={{ alignItems: 'center', paddingVertical: space.xl }}>
              <Text style={type.overline}>На вашем счёте</Text>
              <Text style={styles.big}>{bonus(w.bonus)} ⭐</Text>
              {w.bonusExpiring ? (
                <Text style={[type.callout, { color: colors.amber, marginTop: 6, textAlign: 'center' }]}>
                  {bonus(w.bonusExpiring.amount)} сгорят {inDays(w.bonusExpiring.date)} · {longDate(w.bonusExpiring.date)}
                </Text>
              ) : null}
            </Card>
          ) : w?.bonusHidden ? (
            <Card tone={colors.violet}><Text style={type.headline}>Скоро тут появятся бонусы ⭐</Text></Card>
          ) : null}

          <View style={{ marginTop: space.xl, gap: space.md }}>
            {rules.map((rule) => (
              <View key={rule.title} style={styles.rule}>
                <IconBubble name={rule.icon} color={rule.color} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={type.headline}>{rule.title}</Text>
                  <Text style={[type.callout, { color: colors.textSecondary, marginTop: 3 }]}>{rule.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GUTTER, marginBottom: space.lg },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  big: { color: colors.text, fontSize: 40, fontWeight: '900', fontStyle: 'italic', marginTop: 4, fontVariant: ['tabular-nums'] },
  rule: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
