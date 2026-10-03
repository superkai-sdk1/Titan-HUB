// Вход через Telegram-бота My Titan (@titanwalletrobot).
// 1) Сервер выдаёт одноразовый вход (ticket + код + диплинк на бота).
// 2) Приложение открывает Telegram: бот спрашивает «Войти на устройстве …?».
// 3) Пока клиент подтверждает, приложение опрашивает статус и получает токен.
// Запасной путь — отправить боту 4-значный код (Telegram на другом устройстве).
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoloCard } from '@/components/holo-card';
import { Button, Icon, type IconName, Tap } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { resetDemo } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { colors, GUTTER, MAX_WIDTH, space, type } from '@/lib/theme';
import type { LoginStart, LoginStatus } from '@/lib/types';

type Phase = 'idle' | 'starting' | 'waiting' | 'rejected';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'star', title: 'Бонусы', text: 'Баланс, начисления и когда что сгорит' },
  { icon: 'wallet', title: 'Депозит и долг', text: 'Пополнение и погашение через СБП' },
  { icon: 'notifications', title: 'Уведомления', text: 'Каждая операция — сразу на телефон' },
];

/** Открыть бота в приложении Telegram (tg://), а без него — через t.me в браузере. */
async function openTelegram(deepLink: string) {
  try {
    const url = new URL(deepLink);
    const domain = url.pathname.replace(/^\//, '');
    const start = url.searchParams.get('start');
    await Linking.openURL(`tg://resolve?domain=${domain}${start ? `&start=${start}` : ''}`);
  } catch {
    await Linking.openURL(deepLink);
  }
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useSession((s) => s.signIn);
  const enterDemo = useSession((s) => s.enterDemo);
  const [phase, setPhase] = useState<Phase>('idle');
  const [login, setLogin] = useState<LoginStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const polling = useRef(false);

  async function begin(openBot: boolean) {
    setError(null);
    // Тихое обновление истёкшего кода не должно мигать экраном «Войти».
    if (openBot) setPhase('starting');
    try {
      const r = await api.post<LoginStart>('/auth/wallet-code/start', {
        deviceName: Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      }, { auth: false });
      setLogin(r);
      setPhase('waiting');
      if (openBot && r.deepLink) await openTelegram(r.deepLink);
    } catch (e) {
      setPhase('idle');
      setError(errorText(e));
      haptic.error();
    }
  }

  const poll = useEffectEvent(async () => {
    if (phase !== 'waiting' || !login?.ticket || polling.current) return;
    polling.current = true;
    try {
      const r = await api.get<LoginStatus>(`/auth/wallet-code/status?ticket=${encodeURIComponent(login.ticket)}`, { auth: false });
      if (r.status === 'ok') {
        haptic.success();
        await signIn(r.token);
      } else if (r.status === 'rejected') {
        haptic.warning();
        setPhase('rejected');
      } else if (r.status === 'expired') {
        // Код живёт 5 минут — тихо берём новый, бота заново не открываем.
        await begin(false);
      }
    } catch { /* сеть моргнула — повторим на следующем тике */ } finally {
      polling.current = false;
    }
  });

  useEffect(() => {
    if (phase !== 'waiting') return;
    const timer = setInterval(() => void poll(), 2000);
    // Вернулись из Telegram — проверяем сразу, не дожидаясь таймера.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void poll(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [phase]);

  async function copyCode() {
    if (!login) return;
    await Clipboard.setStringAsync(login.code);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const bot = login?.botUsername ?? 'titanwalletrobot';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        <Animated.View entering={FadeInDown.duration(600).springify().damping(16)}>
          <HoloCard nickname="titan" tierLabel="Резидент" tierColor={colors.violet} bonus={1240} bonusHidden={false} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ marginTop: space.xxl }}>
          <Text style={styles.kicker}>MY TITAN</Text>
          <Text style={[type.title, { marginTop: 6 }]}>Кошелёк клуба{'\n'}в вашем телефоне</Text>
        </Animated.View>

        {phase === 'waiting' && login ? (
          <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.waitCard}>
            <View style={styles.waitHead}>
              <ActivityIndicator color={colors.telegram} />
              <Text style={[type.headline, { flex: 1 }]}>Подтвердите вход в Telegram</Text>
            </View>
            <Text style={[type.callout, { color: colors.textSecondary, marginTop: 8 }]}>
              Бот @{bot} прислал запрос «Вход в My Titan» — нажмите «Да, войти» и вернитесь сюда.
            </Text>
            <Button title="Открыть Telegram" variant="telegram" icon="paper-plane" size="md" style={{ marginTop: space.lg }}
              onPress={() => login.deepLink && void openTelegram(login.deepLink)} />

            <View style={styles.codeBlock}>
              <Text style={[type.caption, { textAlign: 'center' }]}>Telegram на другом устройстве? Отправьте боту код:</Text>
              <Tap onPress={copyCode} scaleTo={0.96} accessibilityRole="button" accessibilityLabel={`Код ${login.code.split('').join(' ')}. Скопировать`}>
                <View style={styles.codeRow}>
                  {login.code.split('').map((d, i) => (
                    <View key={i} style={styles.codeDigit}><Text style={styles.codeText}>{d}</Text></View>
                  ))}
                </View>
              </Tap>
              <Text style={styles.copyHint}>{copied ? 'Скопировано ✓' : 'Нажмите, чтобы скопировать'}</Text>
            </View>

            <Button title="Отмена" variant="ghost" size="md" onPress={() => { setPhase('idle'); setLogin(null); }} />
          </Animated.View>
        ) : phase === 'rejected' ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.waitCard}>
            <View style={styles.waitHead}>
              <Icon name="shield-checkmark" size={24} color={colors.amber} />
              <Text style={[type.headline, { flex: 1 }]}>Вход отклонён</Text>
            </View>
            <Text style={[type.callout, { color: colors.textSecondary, marginTop: 8 }]}>
              В Telegram нажали «Это не я» — доступ не выдан. Если это были вы, начните вход заново.
            </Text>
            <Button title="Попробовать снова" variant="telegram" icon="paper-plane" style={{ marginTop: space.lg }} onPress={() => void begin(true)} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <View style={styles.features}>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.feature}>
                  <View style={styles.featureIcon}><Icon name={f.icon} size={18} color={colors.violetLight} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={type.caption}>{f.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Button
              title="Войти через Telegram"
              variant="telegram"
              icon="paper-plane"
              loading={phase === 'starting'}
              onPress={() => void begin(true)}
              style={{ marginTop: space.xxl }}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.note}>
              Вход через бота @titanwalletrobot. Ваш Telegram должен быть привязан к профилю в клубе — если нет, попросите администратора.
            </Text>
            <Button
              title="Посмотреть демо"
              variant="secondary"
              size="md"
              style={{ marginTop: space.lg }}
              onPress={() => { resetDemo(); enterDemo(); }}
            />
          </Animated.View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: GUTTER, flexGrow: 1 },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  kicker: { color: colors.violetLight, fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  features: { marginTop: space.xl, gap: space.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  featureIcon: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: colors.violetTint,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  error: { color: colors.red, fontSize: 13, textAlign: 'center', marginTop: space.md },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: space.md, paddingHorizontal: space.sm },
  waitCard: {
    marginTop: space.xl, padding: space.lg, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: 'rgba(42,171,238,0.25)',
  },
  waitHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  codeBlock: { marginTop: space.xl, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, alignItems: 'center' },
  codeRow: { flexDirection: 'row', gap: 10, marginTop: space.md },
  codeDigit: {
    width: 52, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.violetTint, borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)',
  },
  codeText: { color: '#fff', fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  copyHint: { color: colors.violetLight, fontSize: 12, fontWeight: '600', marginTop: space.sm, marginBottom: space.sm },
});
