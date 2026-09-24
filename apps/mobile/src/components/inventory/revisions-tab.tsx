import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard, PrimaryButton, sheetStyles } from '@/components/new-check-parts';
import { formatMoney, plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteRevisionDraft, useRevisions, type RevisionSummary } from '@/lib/inventory-api';
import { colors, space, type } from '@/lib/theme';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** История ревизий: черновики сверху, у проведённых — излишки и недостачи в рублях. */
export function RevisionsTab() {
  const router = useRouter();
  const revisions = useRevisions();
  const list = revisions.data ?? [];

  const removeDraft = (revision: RevisionSummary) =>
    Alert.alert('Удалить черновик ревизии?', 'Остатки не изменятся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () =>
          deleteRevisionDraft(revision.id)
            .then(() => haptic.success())
            .catch((error: unknown) => Alert.alert('Черновик не удалён', error instanceof Error ? error.message : String(error))),
      },
    ]);

  return (
    <View style={styles.tab}>
      <PrimaryButton title="Новая ревизия" icon="checklist" onPress={() => router.push('/manage/inventory/revision-editor')} />
      {revisions.isLoading ? (
        <ActivityIndicator style={styles.state} />
      ) : list.length === 0 ? (
        <View style={styles.emptyBox}>
          <SymbolView name="checklist" size={30} tintColor={colors.tertiaryLabel} />
          <Text style={[type.headline, styles.label]}>Ревизий ещё не было</Text>
          <Text style={[type.subhead, styles.secondary, styles.centered]}>Добавьте товары и сверьте фактические остатки — обновятся только они.</Text>
        </View>
      ) : (
        <View style={styles.group}>
          <Text style={[type.footnote, sheetStyles.sectionTitle]}>{`ИСТОРИЯ · ${list.length}`}</Text>
          <GlassCard>
            {list.map((revision, index) => {
              const draft = revision.status === 'draft';
              const clean = revision.surplusValue < 0.005 && revision.shortageValue < 0.005;
              return (
                <View key={revision.id}>
                  {index > 0 && <View style={[sheetStyles.separator, styles.separator]} />}
                  <Pressable
                    onPress={() => {
                      haptic.selection();
                      if (draft) router.push({ pathname: '/manage/inventory/revision-editor', params: { draftId: revision.id } });
                      else router.push({ pathname: '/manage/inventory/revision/[revisionId]', params: { revisionId: revision.id } });
                    }}
                    style={({ pressed }) => [styles.row, pressed && sheetStyles.pressedRow]}
                    accessibilityRole="button">
                    <View style={[styles.icon, { backgroundColor: draft ? 'rgba(139,92,246,0.16)' : 'rgba(245,158,11,0.16)' }]}>
                      <SymbolView name={draft ? 'pencil' : 'checklist'} size={17} tintColor={draft ? '#8B5CF6' : '#F59E0B'} />
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.titleRow}>
                        <Text style={[type.body, styles.label]}>{dateFormat.format(new Date(revision.createdAt))}</Text>
                        {draft && (
                          <View style={styles.draftBadge}>
                            <Text style={[type.caption2, styles.draftText]}>ЧЕРНОВИК</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[type.footnote, styles.secondary]} numberOfLines={1}>
                        {`${revision.positions} ${plural(revision.positions, ['позиция', 'позиции', 'позиций'])}${revision.author ? ` · ${revision.author}` : ''}${draft ? ' · продолжить' : ''}`}
                      </Text>
                    </View>
                    {draft ? (
                      <Pressable onPress={() => removeDraft(revision)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Удалить черновик">
                        <SymbolView name="trash" size={17} tintColor={colors.red} />
                      </Pressable>
                    ) : clean ? (
                      <Text style={[type.footnote, styles.secondary]}>без расхождений</Text>
                    ) : (
                      <View style={styles.values}>
                        {revision.surplusValue >= 0.005 && <Text style={[type.subhead, type.amount, styles.surplus]}>{formatMoney(revision.surplusValue, { sign: true })}</Text>}
                        {revision.shortageValue >= 0.005 && <Text style={[type.subhead, type.amount, styles.shortage]}>{formatMoney(-revision.shortageValue)}</Text>}
                      </View>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </GlassCard>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: space.md },
  flex: { flex: 1 },
  label: { color: colors.label },
  secondary: { color: colors.secondaryLabel },
  centered: { textAlign: 'center' },
  state: { paddingVertical: space.xxl },
  emptyBox: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xl },
  group: { gap: space.sm },
  separator: { marginLeft: 64 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  draftBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.16)' },
  draftText: { color: '#8B5CF6', fontWeight: '800' },
  values: { alignItems: 'flex-end' },
  surplus: { color: colors.green },
  shortage: { color: colors.red },
});
