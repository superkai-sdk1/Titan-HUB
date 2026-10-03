// Настройка планшета сотрудником: клуб → кабинка → PIN. Если токен истёк, а клуб и
// кабинка известны, экран сразу просит PIN.
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PinPad } from '@/components/pin-pad';
import { Button, Icon, Loader, Tap } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { normalizeClubHost, type Space, useSession } from '@/lib/session';
import { verifyStaffPin } from '@/lib/staff';
import { brandGradient, colors, radius, space, type } from '@/lib/theme';

type ClubContext = { club: { slug: string; name: string } | null; subscription?: { blocked?: boolean } | null };

export default function SetupScreen() {
  const club = useSession((s) => s.club);
  const savedSpace = useSession((s) => s.space);
  const step: 'club' | 'space' | 'pin' = !club ? 'club' : !savedSpace ? 'space' : 'pin';
  const { width, height } = useWindowDimensions();
  const landscape = width >= height;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, landscape && { flexDirection: 'row' }]}>
      <View style={[styles.brand, landscape ? styles.brandSide : styles.brandTop]}>
        <View style={styles.logo}>
          <Image source={require('@/assets/images/splash-icon.png')} style={{ width: 84, height: 84 }} contentFit="contain" />
        </View>
        <Text style={styles.brandTitle}>Titan Home</Text>
        <Text style={styles.brandText}>Меню, счёт и свет кабинки — на одном планшете</Text>
        {club ? (
          <View style={styles.clubPill}>
            <Icon name="store-outline" size={18} color={colors.violetLight} />
            <Text style={styles.clubPillText} numberOfLines={1}>{club.name}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.content}>
        {step === 'club' ? <ClubStep /> : step === 'space' ? <SpaceStep /> : <PinStep space={savedSpace!} />}
      </View>
    </KeyboardAvoidingView>
  );
}

function ClubStep() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    const host = normalizeClubHost(value);
    if (!host) {
      setError('Введите адрес клуба, например kbr');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ctx = await api.get<ClubContext>('/club/context', { host, auth: false });
      if (ctx.club && ctx.subscription?.blocked) {
        setError('Подписка клуба приостановлена — обратитесь к владельцу');
        return;
      }
      await useSession.getState().setClub({ host, slug: ctx.club?.slug ?? null, name: ctx.club?.name ?? 'Titan' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View entering={FadeIn} style={styles.step}>
      <Text style={type.title}>Подключение к клубу</Text>
      <Text style={[type.body, styles.lead]}>Адрес клуба в Titan HUB — так же, как при входе в кассу.</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={(t) => { setValue(t); setError(null); }}
          placeholder="kbr"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => void connect()}
          style={styles.input}
        />
        {value.includes('.') ? null : <Text style={styles.suffix}>.titanpos.ru</Text>}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Подключить" icon="arrow-right" onPress={() => void connect()} loading={busy} disabled={!value.trim()} style={{ marginTop: space.xl }} />
    </Animated.View>
  );
}

function SpaceStep() {
  const host = useSession((s) => s.club?.host ?? '');
  const spaces = useQuery({
    queryKey: [host, 'tablet-spaces'],
    queryFn: () =>
      api.get<{ spaces: Space[] }>('/auth/tablet-spaces', { auth: false })
        .then((r) => [...r.spaces].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))),
  });

  return (
    <Animated.View entering={FadeIn} style={[styles.step, { flex: 1 }]}>
      <Text style={type.title}>Где стоит планшет?</Text>
      <Text style={[type.body, styles.lead]}>Выберите кабинку — планшет будет показывать её счёт и управлять её светом.</Text>
      {spaces.isLoading ? (
        <Loader />
      ) : spaces.isError ? (
        <View style={{ gap: space.md }}>
          <Text style={styles.error}>{errorText(spaces.error)}</Text>
          <Button title="Повторить" variant="secondary" icon="refresh" onPress={() => void spaces.refetch()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.spaces}>
          {(spaces.data ?? []).map((sp) => (
            <Tap key={sp.id} style={styles.spaceTile} onPress={() => void useSession.getState().setSpace(sp)} accessibilityRole="button" accessibilityLabel={sp.name}>
              <View style={styles.spaceIcon}>
                <Icon name="sofa-outline" size={30} color={colors.violetLight} />
              </View>
              <Text style={styles.spaceName} numberOfLines={2}>{sp.name}</Text>
            </Tap>
          ))}
          {spaces.data?.length === 0 ? <Text style={type.body}>В клубе нет активных пространств.</Text> : null}
        </ScrollView>
      )}
      <Button title="Другой клуб" variant="ghost" size="md" icon="swap-horizontal" onPress={() => void useSession.getState().forgetClub()} style={{ alignSelf: 'flex-start' }} />
    </Animated.View>
  );
}

function PinStep({ space: sp }: { space: Space }) {
  const host = useSession((s) => s.club?.host);
  const wasSignedIn = useSession((s) => !!s.staff);
  return (
    <Animated.View entering={FadeIn} style={[styles.step, { alignItems: 'center' }]}>
      <View style={styles.spaceChip}>
        <Icon name="sofa-outline" size={20} color={colors.violetLight} />
        <Text style={styles.spaceChipText}>{sp.name}</Text>
      </View>
      <Text style={[type.title, { textAlign: 'center' }]}>PIN сотрудника</Text>
      <Text style={[type.body, styles.lead, { textAlign: 'center' }]}>
        {wasSignedIn ? 'Сессия планшета закончилась — подтвердите её своим PIN.' : 'Тот же PIN, что для входа в кассу.'}
      </Text>
      <PinPad onSubmit={(pin) => verifyStaffPin(sp.id, pin, host)} />
      <Button title="Другая кабинка" variant="ghost" size="md" icon="arrow-left" onPress={() => void useSession.getState().setSpace(null)} style={{ marginTop: space.md }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  brand: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxxl },
  brandSide: { width: '38%', borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.backgroundDeep },
  brandTop: { paddingTop: 56, paddingBottom: space.xl },
  logo: {
    width: 120, height: 120, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderViolet, boxShadow: '0 0 60px rgba(139,92,246,0.35)',
  },
  brandTitle: { fontSize: 38, fontWeight: '900', color: colors.text, letterSpacing: -0.5, marginTop: space.sm },
  brandText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', maxWidth: 320 },
  clubPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.md, paddingHorizontal: 16, height: 40,
    borderRadius: 20, backgroundColor: colors.violetTint, borderWidth: 1, borderColor: colors.borderViolet, maxWidth: 340,
  },
  clubPillText: { color: colors.lavender, fontWeight: '700', fontSize: 15 },
  content: { flex: 1, justifyContent: 'center', padding: space.xxxl },
  step: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.sm },
  lead: { color: colors.textSecondary, marginBottom: space.lg },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', height: 68, borderRadius: radius.tile, paddingHorizontal: space.xl,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong,
  },
  input: { flex: 1, fontSize: 24, fontWeight: '700', color: colors.text, paddingVertical: 0 },
  suffix: { fontSize: 20, color: colors.textMuted, fontWeight: '600' },
  error: { color: colors.red, fontSize: 15, fontWeight: '700', marginTop: space.sm },
  spaces: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, paddingBottom: space.xl },
  spaceTile: {
    width: 184, height: 156, borderRadius: radius.card, padding: space.lg, justifyContent: 'space-between',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderViolet,
  },
  spaceIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.violetTint, alignItems: 'center', justifyContent: 'center' },
  spaceName: { fontSize: 18, fontWeight: '800', color: colors.text },
  spaceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 40, borderRadius: 20, marginBottom: space.md,
    experimental_backgroundImage: brandGradient,
  },
  spaceChipText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
