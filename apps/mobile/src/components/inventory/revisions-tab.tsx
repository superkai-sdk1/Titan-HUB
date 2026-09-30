import { Button, ContentUnavailableView, ProgressView, Section, SwipeActions, Text } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { Alert, type ColorValue } from 'react-native';

import { ActionRow, LinkRow } from '@/components/native-form';
import { formatMoney, plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { deleteRevisionDraft, useRevisions, type RevisionSummary } from '@/lib/inventory-api';
import { colors } from '@/lib/theme';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Ревизии: черновики отдельно, у проведённых — итог расхождений в рублях. */
export function RevisionsTab() {
  const router = useRouter();
  const revisions = useRevisions();
  const list = revisions.data ?? [];
  const drafts = list.filter((r) => r.status === 'draft');
  const applied = list.filter((r) => r.status !== 'draft');

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

  const caption = (revision: RevisionSummary) =>
    [`${revision.positions} ${plural(revision.positions, ['позиция', 'позиции', 'позиций'])}`, revision.author].filter(Boolean).join(' · ');

  /** Чистая ревизия — «сходится»; иначе перевешивающее расхождение со знаком. */
  const result = (revision: RevisionSummary): { value: string; color?: ColorValue } => {
    const surplus = revision.surplusValue >= 0.005 ? revision.surplusValue : 0;
    const shortage = revision.shortageValue >= 0.005 ? revision.shortageValue : 0;
    if (!surplus && !shortage) return { value: 'сходится' };
    const net = surplus - shortage;
    return { value: formatMoney(net, { sign: true, kopecks: 'auto' }), color: net >= 0 ? colors.green : colors.red };
  };

  return (
    <>
      <Section footer={<Text>Добавьте товары и сверьте фактические остатки — обновятся только они.</Text>}>
        <ActionRow title="Новая ревизия" icon="checklist" onPress={() => router.push('/manage/inventory/revision-editor')} />
      </Section>

      {drafts.length > 0 && (
        <Section title={`Черновики · ${drafts.length}`} footer={<Text>Смахните влево, чтобы удалить черновик.</Text>}>
          {drafts.map((revision) => (
            <SwipeActions key={revision.id}>
              <LinkRow
                icon="pencil"
                color="#8B5CF6"
                title={dateFormat.format(new Date(revision.updatedAt ?? revision.createdAt))}
                subtitle={`${caption(revision)} · продолжить`}
                onPress={() => router.push({ pathname: '/manage/inventory/revision-editor', params: { draftId: revision.id } })}
              />
              <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
                <Button role="destructive" label="Удалить" systemImage="trash" onPress={() => removeDraft(revision)} />
              </SwipeActions.Actions>
            </SwipeActions>
          ))}
        </Section>
      )}

      <Section title={applied.length ? `История · ${applied.length}` : undefined} footer={applied.length ? <Text>Справа — итог ревизии: излишки минус недостачи по себестоимости.</Text> : undefined}>
        {revisions.isLoading ? (
          <ProgressView />
        ) : revisions.isError && list.length === 0 ? (
          <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={revisions.error.message} />
        ) : applied.length === 0 ? (
          <ContentUnavailableView title="Ревизий ещё не было" systemImage="checklist" description="Пересчитайте товары — расхождения попадут в журнал склада." />
        ) : (
          applied.map((revision) => {
            const r = result(revision);
            return (
              <LinkRow
                key={revision.id}
                icon="checklist"
                color="#F59E0B"
                title={dateFormat.format(new Date(revision.createdAt))}
                subtitle={[
                  caption(revision),
                  revision.surplusValue >= 0.005 ? `излишек ${formatMoney(revision.surplusValue, { kopecks: 'auto' })}` : null,
                  revision.shortageValue >= 0.005 ? `недостача ${formatMoney(revision.shortageValue, { kopecks: 'auto' })}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                value={r.value}
                valueColor={r.color}
                onPress={() => router.push({ pathname: '/manage/inventory/revision/[revisionId]', params: { revisionId: revision.id } })}
              />
            );
          })
        )}
      </Section>
    </>
  );
}
