// «Кошелёк» — главный экран: карта клуба с бонусами, депозит и долг, быстрые
// действия, взносы (фонд клуба и разовые сборы), прогресс до «Резидента»,
// последние операции.
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { FeedRow } from '@/components/feed-row';
import { HoloCard } from '@/components/holo-card';
import { RollingNumber } from '@/components/rolling-number';
import { Screen } from '@/components/screen';
import {
  Avatar, Button, Card, Divider, EmptyState, Icon, type IconName, SectionTitle, Skeleton, Tap,
} from '@/components/ui';
import { errorText } from '@/lib/api';
import { bonus, inDays, money, plural } from '@/lib/format';
import { pushPermission, registerForPush } from '@/lib/push';
import { refreshMoney, useFeed, useWallet } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { colors, space, type } from '@/lib/theme';
import type { Collection, Wallet } from '@/lib/types';

const PUSH_PROMPT_KEY = 'push_prompt_dismissed';

export default function WalletScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const recent = useFeed('all', 6);
  const w = wallet.data;

  const refresh = async () => {
    refreshMoney();
    await Promise.all([wallet.refetch(), recent.refetch()]);
  };

  if (!w) {
    return (
      <Screen onRefresh={refresh}>
        {wallet.isError ? (
          <EmptyState icon="cloud-offline" title="Не удалось загрузить кошелёк" text={errorText(wallet.error)}>
            <Button title="Повторить" variant="secondary" onPress={() => void wallet.refetch()} />
          </EmptyState>
        ) : (
          <View style={{ gap: space.lg }}>
            <Skeleton height={44} width="60%" />
            <Skeleton height={212} rounded={24} />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Skeleton height={84} style={{ flex: 1 }} /><Skeleton height={84} style={{ flex: 1 }} />
            </View>
            <Skeleton height={180} />
          </View>
        )}
      </Screen>
    );
  }

  const items = recent.data?.pages[0]?.items.slice(0, 5) ?? [];
  const collections = w.collections.filter((c) => !c.excluded);

  return (
    <Screen onRefresh={refresh}>
      <Header wallet={w} onProfile={() => router.navigate('/profile')} onInbox={() => router.navigate('/inbox')} />

      <Animated.View entering={FadeInDown.duration(500).springify().damping(18)}>
        <HoloCard
          nickname={w.profile.nickname}
          tierLabel={w.tier.label}
          tierColor={w.tier.color}
          bonus={w.bonus}
          bonusHidden={w.bonusHidden}
          memberSince={w.profile.memberSince}
        />
      </Animated.View>

      {w.bonusExpiring && !w.bonusHidden ? (
        <Tap onPress={() => router.push('/bonus-rules')} style={styles.expiry} scaleTo={0.98}>
          <Icon name="flame" size={16} color={colors.amber} />
          <Text style={styles.expiryText}>
            {bonus(w.bonusExpiring.amount)} {plural(w.bonusExpiring.amount, 'бонус сгорит', 'бонуса сгорят', 'бонусов сгорят')} {inDays(w.bonusExpiring.date)}
          </Text>
          <Icon name="chevron-forward" size={14} color={colors.amber} />
        </Tap>
      ) : null}

      <View style={styles.plates}>
        <BalanceTile
          label="Депозит"
          value={w.deposit}
          color={colors.green}
          active={w.deposit > 0}
          hint="Пополнить"
          onPress={() => router.push({ pathname: '/pay', params: { purpose: 'deposit' } })}
        />
        <BalanceTile
          label="Долг"
          value={w.debt}
          color={colors.red}
          active={w.debt > 0}
          hint={w.debt > 0 ? 'Погасить' : 'Нет долга'}
          negative
          onPress={w.debt > 0 ? () => router.push({ pathname: '/pay', params: { purpose: 'debt' } }) : undefined}
        />
      </View>

      <QuickActions wallet={w} />

      <PushPrompt />

      {collections.length ? (
        <Animated.View layout={LinearTransition} style={styles.section}>
          <SectionTitle title="Взносы" />
          <View style={{ gap: space.md }}>
            {collections.map((c) => <CollectionCard key={c.id} c={c} online={w.pay.online} />)}
          </View>
        </Animated.View>
      ) : null}

      {w.visitProgress.tier === 'newbie' && w.visitProgress.remaining >= 0 ? <ResidentProgress wallet={w} /> : null}

      <View style={styles.section}>
        <SectionTitle title="Последние операции" action={items.length ? 'Вся история' : undefined} onAction={() => router.navigate('/history')} />
        <View style={styles.list}>
          {recent.isLoading ? (
            <View style={{ padding: space.lg, gap: space.md }}><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /></View>
          ) : items.length === 0 ? (
            <EmptyState icon="receipt-outline" title="Операций пока нет" text="Здесь появятся оплаты, пополнения и бонусы" />
          ) : items.map((it, i) => (
            <View key={it.id}>
              {i > 0 ? <Divider inset={68} /> : null}
              <FeedRow item={it} onOpenCheck={(id) => router.push({ pathname: '/check/[id]', params: { id } })} />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function Header({ wallet, onProfile, onInbox }: { wallet: Wallet; onProfile: () => void; onInbox: () => void }) {
  const demo = useSession((s) => s.status === 'demo');
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  return (
    <View style={styles.header}>
      <Tap onPress={onProfile} scaleTo={0.94} accessibilityLabel="Профиль">
        <Avatar uri={wallet.profile.photoUrl} name={wallet.profile.nickname} size={44} ring />
      </Tap>
      <View style={{ flex: 1 }}>
        <Text style={type.caption}>{hello}{demo ? ' · демо' : ''}</Text>
        <Text style={type.heading} numberOfLines={1}>{wallet.profile.nickname}</Text>
      </View>
      <Tap onPress={onInbox} scaleTo={0.9} style={styles.bell} accessibilityLabel={`Уведомления${wallet.unreadNotifications ? `, непрочитанных ${wallet.unreadNotifications}` : ''}`}>
        <Icon name="notifications-outline" size={22} color={colors.textBody} />
        {wallet.unreadNotifications > 0 ? <View style={styles.bellDot} /> : null}
      </Tap>
    </View>
  );
}

function BalanceTile({
  label, value, color, active, hint, onPress, negative,
}: { label: string; value: number; color: string; active: boolean; hint: string; onPress?: () => void; negative?: boolean }) {
  const content = (
    <View style={[styles.tile, active && { backgroundColor: `${color}14`, borderColor: `${color}40` }]}>
      <Text style={type.overline}>{label}</Text>
      <RollingNumber
        value={value}
        format={(n) => (negative && n > 0 ? `−${money(n)}` : money(n))}
        style={[styles.tileValue, { color: active ? color : colors.textMuted }]}
      />
      <View style={styles.tileHint}>
        <Text style={[styles.tileHintText, { color: onPress ? (active ? color : colors.violetLight) : colors.textMuted }]}>{hint}</Text>
        {onPress ? <Icon name="arrow-forward" size={13} color={active ? color : colors.violetLight} /> : null}
      </View>
    </View>
  );
  return onPress
    ? <Tap onPress={onPress} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${label} ${money(value)}. ${hint}`}>{content}</Tap>
    : <View style={{ flex: 1 }}>{content}</View>;
}

function QuickActions({ wallet }: { wallet: Wallet }) {
  const router = useRouter();
  const due = wallet.collections.find((c) => !c.excluded && c.topUp > 0);
  const actions: { icon: IconName; label: string; color: string; onPress: () => void }[] = [
    { icon: 'add-circle', label: 'Пополнить', color: colors.green, onPress: () => router.push({ pathname: '/pay', params: { purpose: 'deposit' } }) },
  ];
  if (wallet.debt > 0) {
    actions.push({ icon: 'card', label: 'Погасить долг', color: colors.red, onPress: () => router.push({ pathname: '/pay', params: { purpose: 'debt' } }) });
  }
  if (wallet.collections.some((c) => !c.excluded)) {
    actions.push({
      icon: 'people', label: due ? 'Взнос' : 'Взносы', color: colors.cyan,
      onPress: () => router.push({ pathname: '/pay', params: { purpose: 'fund', ...(due ? { collectionId: due.id } : {}) } }),
    });
  }
  actions.push({ icon: 'sparkles', label: 'Бонусы', color: '#FACC15', onPress: () => router.push('/bonus-rules') });
  return (
    <View style={styles.actions}>
      {actions.map((a) => (
        <Tap key={a.label} onPress={a.onPress} style={styles.action} scaleTo={0.93} accessibilityRole="button" accessibilityLabel={a.label}>
          <View style={[styles.actionIcon, { backgroundColor: `${a.color}1f`, borderColor: `${a.color}33` }]}>
            <Icon name={a.icon} size={22} color={a.color} />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>{a.label}</Text>
        </Tap>
      ))}
    </View>
  );
}

function CollectionCard({ c, online }: { c: Collection; online: boolean }) {
  const router = useRouter();
  const owes = c.topUp > 0;
  const tone = owes ? colors.amber : colors.green;
  return (
    <Card tone={tone}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={[styles.collIcon, { backgroundColor: `${tone}22` }]}>
          <Icon name={owes ? 'hourglass' : 'checkmark-circle'} size={20} color={tone} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.headline} numberOfLines={1}>{c.name}</Text>
          <Text style={type.caption}>
            {c.kind === 'recurring' ? c.period.label : c.isMandatory ? 'Разовый сбор' : 'Добровольный сбор'}
            {c.due > 0 ? ` · ${money(c.due)}` : ''}
          </Text>
        </View>
        {owes ? (
          <Text style={[styles.collAmount, { color: tone }]}>{money(c.topUp)}</Text>
        ) : (
          <Text style={[styles.collPaid, { color: tone }]}>Оплачено</Text>
        )}
      </View>
      {c.prepaidMonths > 0 ? (
        <Text style={[type.caption, { marginTop: space.sm }]}>
          Оплачено вперёд на {c.prepaidMonths} {plural(c.prepaidMonths, 'месяц', 'месяца', 'месяцев')}
        </Text>
      ) : null}
      {owes && online ? (
        <Button
          title={`Оплатить ${money(c.topUp)}`}
          size="md"
          style={{ marginTop: space.md }}
          onPress={() => router.push({ pathname: '/pay', params: { purpose: 'fund', collectionId: c.id } })}
        />
      ) : null}
    </Card>
  );
}

function ResidentProgress({ wallet }: { wallet: Wallet }) {
  const vp = wallet.visitProgress;
  const pct = Math.min(1, vp.visits / Math.max(1, vp.threshold));
  return (
    <Card tone={colors.cyan} style={styles.section}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={type.headline}>До статуса «Резидент»</Text>
        <Text style={[styles.progressCount]}>{vp.visits}/{vp.threshold}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={[type.caption, { marginTop: space.sm }]}>
        {vp.remaining > 0
          ? `Ещё ${vp.remaining} ${plural(vp.remaining, 'посещение', 'посещения', 'посещений')} — и вы Резидент 🎉`
          : 'Порог достигнут — статус повысится после следующего визита'}
      </Text>
    </Card>
  );
}

/** Мягкое предложение включить push — системный запрос только по нажатию. */
function PushPrompt() {
  const status = useSession((s) => s.status);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (status !== 'signedIn') return;
    let alive = true;
    void (async () => {
      const dismissed = await SecureStore.getItemAsync(PUSH_PROMPT_KEY).catch(() => null);
      const perm = await pushPermission().catch(() => 'denied' as const);
      if (alive) setVisible(!dismissed && perm === 'undetermined');
    })();
    return () => { alive = false; };
  }, [status]);
  if (!visible) return null;
  const dismiss = () => { setVisible(false); void SecureStore.setItemAsync(PUSH_PROMPT_KEY, '1'); };
  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.section}>
      <Card tone={colors.violet}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <View style={[styles.collIcon, { backgroundColor: colors.violetTint }]}>
            <Icon name="notifications" size={20} color={colors.violetLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.headline}>Уведомления об операциях</Text>
            <Text style={[type.caption, { marginTop: 2 }]}>Начисление бонусов, пополнения, долг и новости клуба — сразу на телефон.</Text>
          </View>
          <Tap onPress={dismiss} hitSlop={10} accessibilityLabel="Скрыть"><Icon name="close" size={18} color={colors.textMuted} /></Tap>
        </View>
        <Button title="Включить" size="md" style={{ marginTop: space.md }} onPress={async () => {
          await registerForPush(true);
          dismiss();
        }} />
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  bell: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  bellDot: {
    position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.pink, borderWidth: 1.5, borderColor: colors.surface,
  },
  expiry: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center',
    marginTop: space.md, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.amberTint, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
  },
  expiryText: { color: colors.amber, fontSize: 13, fontWeight: '700' },
  plates: { flexDirection: 'row', gap: space.md, marginTop: space.lg },
  tile: {
    borderRadius: 18, padding: space.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, minHeight: 104, justifyContent: 'space-between',
  },
  tileValue: { fontSize: 23, fontWeight: '800', fontStyle: 'italic', marginTop: 4 },
  tileHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  tileHintText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: space.xl },
  action: { alignItems: 'center', width: 78, gap: 6 },
  actionIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  actionLabel: { color: colors.textBody, fontSize: 12, fontWeight: '600' },
  section: { marginTop: space.xxl },
  list: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)', overflow: 'hidden' },
  collIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  collAmount: { fontSize: 17, fontWeight: '800', fontStyle: 'italic', fontVariant: ['tabular-nums'] },
  collPaid: { fontSize: 13, fontWeight: '800' },
  progressCount: { color: colors.cyan, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  track: { height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: space.md },
  fill: { height: '100%', borderRadius: 5, experimental_backgroundImage: 'linear-gradient(90deg, #8B5CF6, #4cd7f6)' },
});
