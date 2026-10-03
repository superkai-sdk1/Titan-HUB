// Верхняя полоса экранов гостя: логотип (долгое нажатие — вход сотрудника),
// кабинка, часы и признак «нет связи».
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNetwork } from '@/lib/api';
import { hhmm } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { colors, GUTTER, space } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

import { Icon } from './ui';

const LOGO = require('@/assets/images/splash-icon.png');

/** Скрытый вход в панель сотрудника: удержать логотип 2 секунды. */
export function StaffLogo({ size = 44 }: { size?: number }) {
  const router = useRouter();
  return (
    <Pressable
      delayLongPress={2000}
      onLongPress={() => { haptic.warning(); router.push('/staff'); }}
      accessibilityLabel="Titan Home"
      hitSlop={10}
    >
      <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.3 }]}>
        <Image source={LOGO} style={{ width: size * 0.78, height: size * 0.78 }} contentFit="contain" />
      </View>
    </Pressable>
  );
}

export function TopBar({ subtitle, right }: { subtitle?: string | null; right?: ReactNode }) {
  const space_ = useSession((s) => s.space);
  const online = useNetwork((s) => s.online);
  const now = useNow(10_000);
  return (
    <View style={styles.bar}>
      <StaffLogo />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{space_?.name ?? 'Titan Home'}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {!online ? (
        <View style={styles.offline}>
          <Icon name="wifi-off" size={18} color={colors.red} />
          <Text style={styles.offlineText}>Нет связи</Text>
        </View>
      ) : null}
      {right}
      <Text style={styles.clock}>{hhmm(now)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: space.lg,
    paddingHorizontal: GUTTER, paddingTop: space.lg, paddingBottom: space.md, minHeight: 76,
  },
  logo: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderViolet,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 1 },
  clock: { fontSize: 22, fontWeight: '800', color: colors.textBody, fontVariant: ['tabular-nums'] },
  offline: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17,
    backgroundColor: colors.redTint, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)',
  },
  offlineText: { color: colors.red, fontWeight: '800', fontSize: 13 },
});
