// Шапка экрана гостя: логотип (удержать 2 с — вход сотрудника), кабинка,
// значок «нет связи», кнопка «Свет и климат», часы.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { WifiOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useNetwork } from '@/data/api';
import { useSession } from '@/data/session';
import { RoomButton } from '@/features/room/RoomButton';
import { useVisit } from '@/features/visit/store';
import { hhmm } from '@/lib/format';
import { useMinute } from '@/lib/use-now';
import { glassStyle } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { Press } from '@/ui/press';
import { T } from '@/ui/text';
import { color } from '@/ui/tokens';

const LOGO = require('@/assets/images/splash-icon.png');

export function StaffLogo() {
  const router = useRouter();
  return (
    <Press onLongPress={() => router.push('/staff')} longPressMs={2000} haptics={false} accessibilityLabel="Titan Home" style={[styles.logo, glassStyle('control', 18)]}>
      <Image source={LOGO} style={{ width: 44, height: 44 }} contentFit="contain" />
    </Press>
  );
}

function Clock() {
  const now = useMinute();
  return <T variant="heading" numeric style={styles.clock}>{hhmm(now)}</T>;
}

function Subtitle() {
  const text = useVisit((s) => {
    if (s.phase.kind !== 'session') return 'Добро пожаловать';
    const check = s.snapshot?.check;
    if (!check || check.id !== s.phase.checkId) return 'Счёт открыт';
    const opened = hhmm(new Date(check.openedAt));
    return check.guestName ? `Счёт · ${check.guestName} · с ${opened}` : `Счёт открыт в ${opened} · приятного вечера`;
  });
  return <T variant="caption" tone="secondary" numberOfLines={1}>{text}</T>;
}

export function GuestHeader({ portrait }: { portrait: boolean }) {
  const space = useSession((s) => s.space?.name ?? 'Titan Home');
  const online = useNetwork((s) => s.online);
  return (
    <View style={styles.bar}>
      <StaffLogo />
      <View style={styles.titles}>
        <T variant="heading" numberOfLines={1}>{space}</T>
        <Subtitle />
      </View>
      {!online ? (
        <View style={styles.offline}>
          <Icon as={WifiOff} size={18} tone={color.red} />
          {portrait ? null : <T variant="small" tone="red">Нет связи</T>}
        </View>
      ) : null}
      <RoomButton compact={portrait} />
      <Clock />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56 },
  logo: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  clock: { minWidth: 64, textAlign: 'right', fontSize: 24 },
  offline: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: color.redTint, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)',
  },
});
