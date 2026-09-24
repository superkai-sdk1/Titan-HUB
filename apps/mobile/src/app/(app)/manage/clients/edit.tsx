import { DatePicker, Host, Toggle } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, FormSection } from '@/components/form-parts';
import { Avatar, GlassCard, GlassChip, PrimaryButton, SheetHeader, sheetStyles } from '@/components/new-check-parts';
import { useDebounced } from '@/components/player-picker';
import {
  createClientProfile,
  fetchGomafiaFullName,
  gomafiaIdOf,
  linkGomafia,
  mergeTags,
  tierLook,
  unlinkGomafia,
  updateClient,
  useClient,
  useClientTiers,
  useGomafiaSearch,
  userTags,
  type Client,
  type GomafiaPlayer,
} from '@/lib/clients-api';
import { haptic } from '@/lib/haptics';
import { cleanPhone, pickContact } from '@/lib/phone-book';
import { colors, space, type, useAccentHex } from '@/lib/theme';

const layout = LinearTransition.springify().damping(24).stiffness(220);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const pad = (n: number) => String(n).padStart(2, '0');
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseBirthday(value: string | null | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/**
 * Новый клиент или правка профиля. При создании ник сразу ищется на GoMafia — выбор
 * подставляет ник, имя и фото игрока. Статус — чипами из справочника клуба.
 */
export default function ClientEditSheet() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const router = useRouter();
  const client = useClient(clientId);

  if (clientId && !client.data) {
    return (
      <View style={styles.loading}>
        {client.isError ? <Text style={[type.body, sheetStyles.secondary]}>{errorText(client.error)}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ClientForm
      initial={clientId ? client.data : undefined}
      onClose={() => router.back()}
      onCreated={(created) => {
        router.back();
        setTimeout(() => router.push({ pathname: '/manage/clients/[clientId]', params: { clientId: created.id } }), 420);
      }}
    />
  );
}

function ClientForm({ initial, onClose, onCreated }: { initial: Client | undefined; onClose: () => void; onCreated: (client: Client) => void }) {
  const insets = useSafeAreaInsets();
  const accent = useAccentHex();
  const tiers = useClientTiers();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const initialBirthday = parseBirthday(initial?.birthday);
  const [hasBirthday, setHasBirthday] = useState(!!initial?.birthday);
  const [birthday, setBirthday] = useState<Date>(initialBirthday ?? new Date(2000, 0, 1));
  const [birthdayTouched, setBirthdayTouched] = useState(false);
  const [tier, setTier] = useState(initial?.clientTier ?? 'newbie');
  const [tagsText, setTagsText] = useState(initial ? userTags(initial).join(', ') : '');
  const [gomafia, setGomafia] = useState<GomafiaPlayer | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);

  const creating = !initial;
  const linkedId = initial ? gomafiaIdOf(initial) : null;
  // При создании ищем по нику; при правке — отдельным полем «Сопоставить».
  const gomafiaQuery = useDebounced(creating ? (gomafia ? '' : nickname) : linking ? linkQuery : '', 350);
  const suggestions = useGomafiaSearch(gomafiaQuery);
  const tierList = [...(tiers.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const pickGomafia = (player: GomafiaPlayer) => {
    haptic.selection();
    setGomafia(player);
    setNickname(player.login);
    if (player.fullName) setFullName((current) => current || player.fullName || '');
    else void fetchGomafiaFullName(player.gomafiaId).then((name) => name && setFullName((current) => current || name));
  };

  const link = async (player: GomafiaPlayer) => {
    if (!initial) return;
    haptic.medium();
    try {
      await linkGomafia(initial.id, player.gomafiaId);
      haptic.success();
      setLinking(false);
      setLinkQuery('');
    } catch (error) {
      haptic.error();
      Alert.alert('Не сопоставлено', errorText(error));
    }
  };

  const unlink = () =>
    Alert.alert('Снять привязку GoMafia?', 'Фото с GoMafia у клиента пропадёт.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Снять',
        style: 'destructive',
        onPress: () =>
          initial &&
          unlinkGomafia(initial.id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Привязка не снята', errorText(error))),
      },
    ]);

  /** Телефон и имя клиента из адресной книги. Ник оставляем как есть — он игровой. */
  const fromContacts = () => {
    haptic.light();
    void pickContact().then((contact) => {
      if (!contact) return;
      if (contact.phone) setPhone(cleanPhone(contact.phone));
      if (contact.name && !fullName.trim()) setFullName(contact.name);
      haptic.success();
    });
  };

  const save = async () => {
    const nick = nickname.trim();
    if (nick.length < 2) return Alert.alert('Ник — минимум 2 символа');
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const birthdayValue = hasBirthday ? toDateKey(birthday) : null;

    haptic.medium();
    setBusy(true);
    try {
      if (initial) {
        await updateClient(initial.id, {
          nickname: nick,
          fullName: fullName.trim() || null,
          phone: phone.trim() || null,
          // Нестандартную дату из веба не перезаписываем, пока её не трогали.
          ...(birthdayTouched || !hasBirthday || initialBirthday ? { birthday: birthdayValue } : {}),
          clientTier: tier,
          searchTags: mergeTags(initial, tags),
        });
        haptic.success();
        onClose();
      } else {
        const created = await createClientProfile(
          { nickname: nick, fullName: fullName.trim() || null, phone: phone.trim() || null, birthday: birthdayValue, clientTier: tier, tags },
          gomafia,
        );
        haptic.success();
        onCreated(created);
      }
    } catch (error) {
      haptic.error();
      Alert.alert(initial ? 'Изменения не сохранены' : 'Клиент не создан', errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const suggestionList = (suggestions.data ?? []).slice(0, 5);
  const showSuggestions = gomafiaQuery.length >= 2 && (suggestions.isFetching || suggestionList.length > 0);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <SheetHeader title={initial ? 'Профиль клиента' : 'Новый клиент'} onClose={onClose} />

        <FormSection title="НИК И ИМЯ" footer={creating && !gomafia ? 'Начните вводить ник — найдём игрока на GoMafia и подставим имя и фото.' : undefined}>
          <GlassCard style={styles.card}>
            <FormField icon="person" value={nickname} onChange={setNickname} placeholder="Ник *" autoFocus={creating} />
            <View style={sheetStyles.separator} />
            <FormField icon="person.text.rectangle" value={fullName} onChange={setFullName} placeholder="Реальное имя" autoCapitalize="words" />
          </GlassCard>

          {creating && gomafia && (
            <Animated.View entering={FadeIn} exiting={FadeOut} layout={layout}>
              <GlassCard tint="rgba(139,92,246,0.18)" style={styles.gomafia}>
                <Avatar name={gomafia.login} photoUrl={gomafia.avatar} size={40} />
                <View style={styles.flex}>
                  <Text style={[type.headline, sheetStyles.label]} numberOfLines={1}>{`GoMafia · ${gomafia.login}`}</Text>
                  <Text style={[type.footnote, sheetStyles.secondary]} numberOfLines={1}>
                    {[gomafia.fullName, gomafia.clubTitle, gomafia.elo ? `ELO ${Math.round(gomafia.elo)}` : null].filter(Boolean).join(' · ') || `#${gomafia.gomafiaId}`}
                  </Text>
                </View>
                <Pressable onPress={() => setGomafia(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Не привязывать GoMafia">
                  <SymbolView name="xmark.circle.fill" size={22} tintColor={colors.tertiaryLabel} />
                </Pressable>
              </GlassCard>
            </Animated.View>
          )}

          {creating && showSuggestions && <GomafiaResults players={suggestionList} loading={suggestions.isFetching} onPick={pickGomafia} />}
        </FormSection>

        <FormSection title="КОНТАКТЫ">
          <GlassCard style={styles.card}>
            <FormField icon="phone" value={phone} onChange={setPhone} placeholder="Телефон" keyboardType="phone-pad" />
            <View style={sheetStyles.separator} />
            <Pressable onPress={fromContacts} style={({ pressed }) => [styles.contactRow, pressed && sheetStyles.pressedRow]} accessibilityRole="button">
              <SymbolView name="person.crop.circle.badge.plus" size={18} tintColor={colors.accent} />
              <Text style={[type.body, styles.contactText]}>Взять телефон из контактов</Text>
            </Pressable>
            <View style={sheetStyles.separator} />
            <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
              <Toggle
                label="День рождения"
                isOn={hasBirthday}
                onIsOnChange={(on) => {
                  haptic.selection();
                  setHasBirthday(on);
                  setBirthdayTouched(true);
                }}
                modifiers={[tint(accent)]}
              />
            </Host>
            {hasBirthday && (
              <>
                <View style={sheetStyles.separator} />
                <Host matchContents={{ vertical: true }} style={styles.control} seedColor={accent}>
                  <DatePicker
                    title="Дата"
                    selection={birthday}
                    displayedComponents={['date']}
                    onDateChange={(date) => {
                      setBirthday(date);
                      setBirthdayTouched(true);
                    }}
                  />
                </Host>
              </>
            )}
          </GlassCard>
        </FormSection>

        <FormSection title="СТАТУС">
          <View style={styles.chips}>
            {tierList.map((t) => {
              const look = tierLook(t.key, tiers.data);
              return (
                <GlassChip
                  key={t.key}
                  label={look.label}
                  tint={look.color}
                  active={tier === t.key}
                  onPress={() => {
                    haptic.selection();
                    setTier(t.key);
                  }}
                />
              );
            })}
            {tiers.isLoading && <ActivityIndicator />}
          </View>
        </FormSection>

        <FormSection title="ТЕГИ" footer="Через запятую. Поиск клиентов находит и по тегам.">
          <GlassCard style={styles.card}>
            <FormField icon="tag" value={tagsText} onChange={setTagsText} placeholder="VIP, друг, постоянный" />
          </GlassCard>
        </FormSection>

        {initial && (
          <FormSection title="GOMAFIA">
            <GlassCard style={styles.card}>
              {linkedId ? (
                <View style={styles.linkRow}>
                  <SymbolView name="checkmark.seal.fill" size={20} tintColor={colors.green} />
                  <Pressable style={styles.flex} onPress={() => void Linking.openURL(`https://gomafia.pro/stats/${linkedId}`)} accessibilityRole="link">
                    <Text style={[type.body, sheetStyles.label]}>{`Профиль #${linkedId}`}</Text>
                    <Text style={[type.footnote, styles.link]}>Открыть на gomafia.pro</Text>
                  </Pressable>
                  <Pressable onPress={unlink} hitSlop={8} accessibilityRole="button">
                    <Text style={[type.subhead, styles.destructive]}>Отвязать</Text>
                  </Pressable>
                </View>
              ) : linking ? (
                <View style={styles.linkSearch}>
                  <SymbolView name="magnifyingglass" size={16} tintColor={colors.secondaryLabel} />
                  <TextInput
                    autoFocus
                    value={linkQuery}
                    onChangeText={setLinkQuery}
                    placeholder="Ник игрока на GoMafia"
                    placeholderTextColor={colors.tertiaryLabel}
                    selectionColor={colors.accent}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[type.body, styles.input]}
                  />
                  <Pressable onPress={() => setLinking(false)} hitSlop={8} accessibilityRole="button">
                    <Text style={[type.subhead, styles.link]}>Отмена</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.linkRow}
                  onPress={() => {
                    haptic.light();
                    setLinking(true);
                    setLinkQuery(initial.nickname);
                  }}
                  accessibilityRole="button">
                  <SymbolView name="link.badge.plus" size={20} tintColor={colors.accent} />
                  <Text style={[type.body, styles.link, styles.flex]}>Сопоставить с GoMafia</Text>
                </Pressable>
              )}
            </GlassCard>
            {linking && showSuggestions && <GomafiaResults players={suggestionList} loading={suggestions.isFetching} onPick={(player) => void link(player)} />}
          </FormSection>
        )}

        <PrimaryButton
          title={busy ? 'Сохраняем…' : initial ? 'Сохранить' : 'Создать клиента'}
          icon="checkmark"
          busy={busy}
          disabled={nickname.trim().length < 2}
          onPress={() => void save()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GomafiaResults({ players, loading, onPick }: { players: GomafiaPlayer[]; loading: boolean; onPick: (player: GomafiaPlayer) => void }) {
  return (
    <Animated.View entering={FadeIn.duration(150)} layout={layout}>
      <GlassCard>
        {players.length === 0 && loading ? (
          <View style={styles.resultsState}>
            <ActivityIndicator />
            <Text style={[type.subhead, sheetStyles.secondary]}>Ищем на GoMafia…</Text>
          </View>
        ) : (
          players.map((player, index) => (
            <View key={player.gomafiaId}>
              {index > 0 && <View style={[sheetStyles.separator, styles.resultSeparator]} />}
              <Pressable style={({ pressed }) => [styles.result, pressed && sheetStyles.pressedRow]} onPress={() => onPick(player)} accessibilityRole="button">
                <Avatar name={player.login} photoUrl={player.avatar} size={36} />
                <View style={styles.flex}>
                  <View style={styles.resultTitle}>
                    <Text style={[type.body, sheetStyles.label, styles.shrink]} numberOfLines={1}>
                      {player.login}
                    </Text>
                    {player.inClub && (
                      <View style={styles.clubBadge}>
                        <Text style={[type.caption2, styles.clubBadgeText]}>клуб</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[type.footnote, sheetStyles.secondary]} numberOfLines={1}>
                    {[player.clubTitle ?? 'Без клуба', player.elo ? `ELO ${Math.round(player.elo)}` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <SymbolView name="plus.circle" size={20} tintColor={colors.accent} />
              </Pressable>
            </View>
          ))
        )}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  contactText: { color: colors.accent, fontWeight: '600' },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  content: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  card: { paddingHorizontal: space.lg },
  control: { alignSelf: 'stretch', paddingVertical: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  gomafia: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  link: { color: colors.accent },
  destructive: { color: colors.red, fontWeight: '600' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 54 },
  linkSearch: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50 },
  input: { flex: 1, color: colors.label, minHeight: 50 },
  resultsState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.lg },
  resultSeparator: { marginLeft: 64 },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 56 },
  resultTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clubBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.18)' },
  clubBadgeText: { color: '#8B5CF6', fontWeight: '700' },
});
