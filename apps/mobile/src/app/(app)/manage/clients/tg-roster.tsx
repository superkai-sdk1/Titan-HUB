import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClearButton } from '@/components/clear-button';
import { GlassCard, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { linkClientTg, useClient, useTgRoster, type TgRosterUser } from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { KEYBOARD_DISMISS } from '@/lib/layout';
import { colors, space, type } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const fullName = (u: TgRosterUser) => [u.firstName, u.lastName].filter(Boolean).join(' ');

/**
 * «Участники чата» — как в веб-карточке клиента: бот видит, кто пишет в чатах клуба, и
 * Telegram можно привязать выбором из списка, без QR-кода. Аккаунт добавляется к
 * профилю, а не заменяет прежний: у одного человека бывает несколько Telegram.
 */
export default function TgRosterSheet() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const client = useClient(clientId);
  const roster = useTgRoster();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru').replace(/^@/, '');
    const users = [...(roster.data ?? [])].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    if (!q) return users;
    return users.filter((u) => [u.username, u.firstName, u.lastName, u.tgId].some((v) => v?.toLocaleLowerCase('ru').includes(q)));
  }, [roster.data, query]);

  const nickname = client.data?.nickname ?? 'клиенту';

  const pick = (user: TgRosterUser) => {
    const who = user.username ? `@${user.username}` : fullName(user) || `ID ${user.tgId}`;
    Alert.alert(`Привязать ${who}?`, `Telegram добавится к профилю «${nickname}». Прежние аккаунты останутся.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Привязать',
        onPress: () => {
          setBusy(user.tgId);
          linkClientTg(clientId, user)
            .then(() => {
              haptic.success();
              router.back();
            })
            .catch((error: unknown) => {
              haptic.error();
              Alert.alert('Не привязано', errorText(error));
            })
            .finally(() => setBusy(null));
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.sheet}>
      <View style={styles.top}>
        <SheetHeader title="Участники чата" onClose={() => router.back()} />
        <Text style={[type.footnote, sheetStyles.secondary]}>Кто писал в чатах клуба при боте. Выберите аккаунт гостя.</Text>
        <GlassCard style={styles.search}>
          <SymbolView name="magnifyingglass" size={16} weight="medium" tintColor={colors.secondaryLabel} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Имя или @username"
            placeholderTextColor={colors.tertiaryLabel}
            selectionColor={colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[type.body, styles.searchInput]}
          />
          <ClearButton visible={query.length > 0} onPress={() => setQuery('')} />
        </GlassCard>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={KEYBOARD_DISMISS}>
        {roster.isLoading ? (
          <ActivityIndicator style={styles.state} />
        ) : list.length === 0 ? (
          <Text style={[type.subhead, sheetStyles.secondary, styles.state]}>
            {roster.isError ? errorText(roster.error) : query ? 'Никого не нашли' : 'Бот ещё никого не видел в чатах клуба.'}
          </Text>
        ) : (
          <GlassCard>
            {list.map((user, index) => {
              const taken = !!user.linkedTo;
              return (
                <View key={user.tgId}>
                  {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                  <Pressable
                    disabled={taken || busy !== null}
                    onPress={() => pick(user)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    accessibilityRole="button">
                    <View style={[styles.icon, taken && styles.iconTaken]}>
                      <SymbolView name="paperplane.fill" size={14} tintColor="white" />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[type.body, styles.label, taken && styles.dim]} numberOfLines={1}>
                        {user.username ? `@${user.username}` : fullName(user) || `ID ${user.tgId}`}
                      </Text>
                      <Text style={[type.footnote, sheetStyles.secondary]} numberOfLines={1}>
                        {taken ? `Уже у «${user.linkedTo}»` : fullName(user) || 'без имени'}
                      </Text>
                    </View>
                    {busy === user.tgId ? <ActivityIndicator /> : !taken && <SymbolView name="plus.circle.fill" size={22} tintColor={colors.accent} />}
                  </Pressable>
                </View>
              );
            })}
          </GlassCard>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  flex: { flex: 1 },
  top: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.md, paddingBottom: space.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, height: 48 },
  searchInput: { flex: 1, color: colors.label, height: 48, paddingVertical: 0 },
  list: { paddingHorizontal: space.lg, gap: space.md },
  state: { paddingTop: space.xxl, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  separator: { marginLeft: 62 },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0EA5E9' },
  iconTaken: { backgroundColor: colors.gray },
  label: { color: colors.label },
  dim: { color: colors.secondaryLabel },
  pressed: { opacity: 0.6 },
});
