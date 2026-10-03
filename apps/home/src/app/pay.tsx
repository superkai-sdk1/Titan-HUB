// Оплата счёта по QR (СБП): чаевые → QR. Сумму считает сервер; чек закроется
// вебхуком банка, киоск узнает об этом по SSE и сам покажет «Оплата прошла».
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';

import { Button, Icon, IconButton, Tap } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { toast, useFlow } from '@/lib/flow';
import { amount, money } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { checkTotals } from '@/lib/money';
import { useCheck } from '@/lib/queries';
import { colors, GUTTER, radius, space, type } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

const TIPS = [0, 5, 10, 15];

type Qr = { qrDataUrl: string; chargedAmount?: number; baseAmount?: number; tip?: number };

export default function PayScreen() {
  const router = useRouter();
  const phase = useFlow((s) => s.phase);
  const checkId = phase.kind === 'session' ? phase.checkId : null;
  const check = useCheck(checkId);
  const [qr, setQr] = useState<Qr | null>(null);
  const [busyTip, setBusyTip] = useState<number | null>(null);

  // Оплачено (или счёт закрыли на кассе) — уходим, главный экран покажет благодарность.
  useEffect(() => {
    if (!checkId) router.back();
  }, [checkId, router]);

  const now = useNow(15_000);
  const total = check.data ? checkTotals(check.data, now.getTime()).total : 0;

  const create = async (pct: number) => {
    if (!checkId || busyTip != null) return;
    const tip = Math.round((total * pct) / 100);
    setBusyTip(pct);
    try {
      const res = await api.post<Qr>(`/pos/checks/${checkId}/qr`, { tip });
      haptic.success();
      setQr(res);
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setBusyTip(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <IconButton icon="arrow-left" label="Назад" onPress={() => router.back()} />
        <Text style={type.title}>{qr ? 'Оплата по СБП' : 'Оплата счёта'}</Text>
      </View>
      {qr ? (
        <QrView qr={qr} onCancel={() => setQr(null)} />
      ) : (
        <ScrollView contentContainerStyle={styles.tips}>
          <Text style={type.overline}>К оплате</Text>
          <View style={styles.totalRow}>
            <Text style={styles.total}>{amount(total)}</Text>
            <Text style={styles.totalRub}>₽</Text>
          </View>
          <Text style={[type.heading, { marginTop: space.xl }]}>Оставить чаевые команде?</Text>
          <Text style={[type.body, { color: colors.textSecondary }]}>Добавятся к сумме в QR — спасибо, нам приятно 💜</Text>
          <View style={styles.tipGrid}>
            {TIPS.map((pct) => {
              const tip = Math.round((total * pct) / 100);
              return (
                <Tap
                  key={pct}
                  style={[styles.tip, pct > 0 && styles.tipGreen]}
                  onPress={() => void create(pct)}
                  disabled={busyTip != null || total <= 0}
                  accessibilityRole="button"
                >
                  <Text style={[styles.tipTitle, pct > 0 && { color: colors.green }]}>{pct ? `${pct}%` : 'Без чаевых'}</Text>
                  <Text style={styles.tipSum}>{busyTip === pct ? 'Готовим QR…' : pct ? `+${money(tip)}` : money(total)}</Text>
                </Tap>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function QrView({ qr, onCancel }: { qr: Qr; onCancel: () => void }) {
  const charged = qr.chargedAmount ?? qr.baseAmount ?? 0;
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1100 }), -1, true));
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View entering={FadeIn} style={styles.qrWrap}>
      <Animated.View entering={ZoomIn.springify().damping(15)} style={styles.qrCard}>
        <Image source={{ uri: qr.qrDataUrl }} style={styles.qr} contentFit="contain" />
      </Animated.View>
      <View style={styles.qrInfo}>
        <Text style={[type.body, { color: colors.textSecondary }]}>Отсканируйте камерой телефона или в приложении банка</Text>
        <View style={styles.totalRow}>
          <Text style={styles.total}>{amount(charged)}</Text>
          <Text style={styles.totalRub}>₽</Text>
        </View>
        {qr.tip ? <Text style={styles.tipNote}>в том числе чаевые {money(qr.tip)} 💚</Text> : null}
        <Animated.View style={[styles.waiting, pulseStyle]}>
          <Icon name="timer-sand" size={22} color={colors.cyan} />
          <Text style={styles.waitingText}>Ждём подтверждения банка…</Text>
        </Animated.View>
        <Button title="Изменить чаевые" variant="secondary" size="md" icon="arrow-left" onPress={onCancel} style={{ alignSelf: 'flex-start', marginTop: space.lg }} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: GUTTER, paddingTop: space.xl, paddingBottom: space.md },
  tips: { padding: GUTTER, paddingTop: space.md, maxWidth: 760, width: '100%', alignSelf: 'center', gap: space.sm },
  totalRow: { flexDirection: 'row', alignItems: 'flex-start' },
  total: { fontSize: 72, lineHeight: 80, fontWeight: '900', color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -2 },
  totalRub: { fontSize: 34, lineHeight: 52, fontWeight: '800', color: colors.violetLight, marginLeft: 6 },
  tipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.lg },
  tip: {
    flexGrow: 1, flexBasis: '45%', minHeight: 120, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: colors.borderStrong,
  },
  tipGreen: { backgroundColor: colors.greenTint, borderColor: 'rgba(52,211,153,0.4)' },
  tipTitle: { fontSize: 26, fontWeight: '900', color: colors.textBody },
  tipSum: { fontSize: 17, fontWeight: '700', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  qrWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space.xxxl, padding: GUTTER },
  qrCard: { padding: 20, borderRadius: 32, backgroundColor: '#fff', boxShadow: '0 20px 60px rgba(76,215,246,0.25)' },
  qr: { width: 320, height: 320 },
  qrInfo: { maxWidth: 380, gap: space.sm },
  tipNote: { fontSize: 15, fontWeight: '700', color: colors.green },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  waitingText: { fontSize: 17, fontWeight: '700', color: colors.cyan },
});
