import { Button, ContentUnavailableView, Form, HStack, Image, Picker, ProgressView, RNHostView, Section, Spacer, Text, Toggle, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { EditorToolbar } from '@/components/editor-toolbar';
import { ActionRow, FieldRow, FormHost, footnote, primary, secondary, SearchRow } from '@/components/native-form';
import { Avatar } from '@/components/new-check-parts';
import {
  isTargetEmpty,
  sendBroadcast,
  useAudienceStats,
  useBroadcastPolls,
  useBroadcastRecipients,
  type BroadcastAudience,
  type BroadcastTarget,
  type PollRow,
  type PollTarget,
  type RecipientRow,
} from '@/lib/broadcasts-api';
import { useClientTiers } from '@/lib/clients-api';
import { plural } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors } from '@/lib/theme';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const clientsWord = (n: number) => plural(n, ['клиент', 'клиента', 'клиентов']);

const AUDIENCES: { key: BroadcastAudience; label: string }[] = [
  { key: 'all', label: 'Все клиенты' },
  { key: 'tier', label: 'По статусу' },
  { key: 'debtors', label: 'Должники' },
  { key: 'depositors', label: 'С депозитом' },
  { key: 'profiles', label: 'Выбранные' },
  { key: 'poll', label: 'По опросу в Telegram' },
];

const pollDate = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Строка с галочкой: отметить клиента или опрос. */
function CheckRow({ checked, onPress, children }: { checked: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Button
      onPress={() => {
        haptic.selection();
        onPress();
      }}>
      <HStack spacing={12}>
        <Image
          systemName={checked ? 'checkmark.circle.fill' : 'circle'}
          size={22}
          modifiers={[foregroundStyle(checked ? colors.accent : colors.tertiaryLabel)]}
        />
        {children}
      </HStack>
    </Button>
  );
}

function ChannelMark({ icon, on }: { icon: SFSymbol; on: boolean }) {
  return <Image systemName={icon} size={13} modifiers={[foregroundStyle(on ? colors.accent : colors.tertiaryLabel)]} />;
}

/** Новая рассылка клиентам: кому, текст, каналы. Отправка — после подтверждения. */
export default function ComposeBroadcast() {
  const router = useRouter();
  const tiers = useClientTiers();
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [tier, setTier] = useState<string>('resident');
  const [picked, setPicked] = useState<string[]>([]);
  const [poll, setPoll] = useState<PollTarget | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [push, setPush] = useState(true);
  const [telegram, setTelegram] = useState(false);
  const [busy, setBusy] = useState(false);

  const target: BroadcastTarget = useMemo(
    () => ({
      audience,
      ...(audience === 'tier' ? { tier } : {}),
      ...(audience === 'profiles' ? { profileIds: picked } : {}),
      ...(audience === 'poll' && poll ? { poll } : {}),
    }),
    [audience, tier, picked, poll],
  );
  const empty = isTargetEmpty(target);
  const stats = useAudienceStats(target);
  const recipients = empty ? 0 : (stats.data?.recipients ?? 0);
  const canSend = title.trim().length > 0 && body.trim().length > 0 && recipients > 0;

  const statsText = empty
    ? audience === 'profiles'
      ? 'Отметьте получателей ниже.'
      : 'Выберите опрос и варианты ответа.'
    : stats.data
      ? `Получат ${recipients} ${clientsWord(recipients)} · с приложением ${stats.data.withApp} · в Telegram ${stats.data.withTelegram}.`
      : 'Считаем получателей…';

  const send = () => {
    if (!canSend) return;
    Alert.alert('Отправить рассылку?', `«${title.trim()}» получат ${recipients} ${clientsWord(recipients)}. Отменить отправку будет нельзя.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Отправить',
        onPress: async () => {
          haptic.medium();
          setBusy(true);
          try {
            const r = await sendBroadcast(target, { title, body, push, telegram });
            haptic.success();
            router.back();
            Alert.alert('Рассылка отправлена', `${r.recipients} ${clientsWord(r.recipients)}. Счётчики доставки появятся в журнале через несколько секунд.`);
          } catch (error) {
            haptic.error();
            Alert.alert('Не отправлено', errorText(error));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <>
      <EditorToolbar title="Рассылка" canSave={canSend} busy={busy} saveLabel="Отправить" busyLabel="Отправляем…" onSave={send} />
      <FormHost>
        <Form>
          <Section title="Кому" footer={<Text>{statsText}</Text>}>
            <Picker label="Аудитория" selection={audience} onSelectionChange={(value) => setAudience(value as BroadcastAudience)} modifiers={[pickerStyle('menu')]}>
              {AUDIENCES.map((a) => (
                <Text key={a.key} modifiers={[tag(a.key)]}>
                  {a.label}
                </Text>
              ))}
            </Picker>
            {audience === 'tier' && (
              <Picker label="Статус" selection={tier} onSelectionChange={(value) => setTier(String(value))} modifiers={[pickerStyle('menu')]}>
                {(tiers.data ?? []).map((t) => (
                  <Text key={t.key} modifiers={[tag(t.key)]}>
                    {t.label}
                  </Text>
                ))}
              </Picker>
            )}
          </Section>

          {audience === 'profiles' && <RecipientsSection picked={picked} onChange={setPicked} />}
          {audience === 'poll' && <PollSection value={poll} onChange={setPoll} />}

          <Section title="Сообщение" footer={<Text>{`${body.length}/1000 · клиенты, отключившие новости клуба, рассылку не получат.`}</Text>}>
            <FieldRow value={title} placeholder="Заголовок, например «Турнир в субботу»" maxLength={80} onChange={setTitle} />
            <FieldRow value={body} placeholder="Текст сообщения" maxLength={1000} multiline onChange={setBody} />
          </Section>

          <Section title="Каналы" footer={<Text>Во «Входящих» приложения сообщение появится у всех получателей.</Text>}>
            <Toggle label="Push на телефон" isOn={push} onIsOnChange={setPush} />
            <Toggle label="Дублировать в Telegram" isOn={telegram} onIsOnChange={setTelegram} />
          </Section>
        </Form>
      </FormHost>
    </>
  );
}

/** Ручной выбор: поиск, отметки, «только с приложением», отметить/снять видимых. */
function RecipientsSection({ picked, onChange }: { picked: string[]; onChange: (ids: string[]) => void }) {
  const list = useBroadcastRecipients(true);
  const [query, setQuery] = useState('');
  const [onlyApp, setOnlyApp] = useState(false);
  const set = useMemo(() => new Set(picked), [picked]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (list.data ?? []).filter(
      (c) => (!onlyApp || c.hasApp) && (!needle || c.nickname.toLowerCase().includes(needle) || (c.fullName ?? '').toLowerCase().includes(needle)),
    );
  }, [list.data, query, onlyApp]);
  const allShown = shown.length > 0 && shown.every((c) => set.has(c.id));
  const toggle = (c: RecipientRow) => onChange(set.has(c.id) ? picked.filter((id) => id !== c.id) : [...picked, c.id]);

  return (
    <Section title={`Получатели · отмечено ${picked.length}`} footer={<Text>Значки справа: приложение My Titan и привязанный Telegram.</Text>}>
      <SearchRow placeholder="Ник или имя" onChange={setQuery} />
      <Toggle label="Только с приложением" isOn={onlyApp} onIsOnChange={setOnlyApp} />
      {shown.length > 0 && (
        <ActionRow
          title={allShown ? 'Снять отметки со списка' : `Отметить всех в списке · ${shown.length}`}
          icon={allShown ? 'minus.circle' : 'checkmark.circle'}
          onPress={() =>
            onChange(allShown ? picked.filter((id) => !shown.some((c) => c.id === id)) : [...new Set([...picked, ...shown.map((c) => c.id)])])
          }
        />
      )}
      {list.isLoading ? (
        <ProgressView />
      ) : list.isError ? (
        <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={list.error.message} />
      ) : shown.length === 0 ? (
        <ContentUnavailableView title="Никого не нашли" systemImage="person.2.slash" description="Измените запрос." />
      ) : (
        shown.map((c) => (
          <CheckRow key={c.id} checked={set.has(c.id)} onPress={() => toggle(c)}>
            <RNHostView matchContents>
              <Avatar name={c.nickname} photoUrl={c.photoUrl} size={32} />
            </RNHostView>
            <VStack alignment="leading" spacing={1}>
              <Text modifiers={[primary, lineLimit(1)]}>{c.nickname}</Text>
              {c.fullName ? <Text modifiers={[footnote, secondary, lineLimit(1)]}>{c.fullName}</Text> : null}
            </VStack>
            <Spacer />
            <ChannelMark icon="iphone" on={c.hasApp} />
            <ChannelMark icon="paperplane" on={c.hasTelegram} />
          </CheckRow>
        ))
      )}
    </Section>
  );
}

/** Последний опрос чата: кто выбрал отмеченные варианты и/или не голосовал. */
function PollSection({ value, onChange }: { value: PollTarget | null; onChange: (next: PollTarget | null) => void }) {
  const polls = useBroadcastPolls(true);
  const rows = polls.data ?? [];
  const current: PollRow | null = rows.find((p) => p.chatId === value?.chatId) ?? null;

  return (
    <>
      <Section title="Опрос" footer={<Text>Последний опрос каждого чата, который выложил бот. Голос сопоставляется с клиентом по привязанному Telegram.</Text>}>
        {polls.isLoading ? (
          <ProgressView />
        ) : polls.isError ? (
          <ContentUnavailableView title="Нет связи" systemImage="wifi.exclamationmark" description={polls.error.message} />
        ) : rows.length === 0 ? (
          <ContentUnavailableView title="Опросов пока нет" systemImage="checklist" description="Они появятся, когда бот выложит опрос в чат." />
        ) : (
          rows.map((p) => {
            const on = p.chatId === value?.chatId;
            return (
              <CheckRow key={p.chatId} checked={on} onPress={() => onChange(on ? null : { chatId: p.chatId, options: [], notVoted: false })}>
                <VStack alignment="leading" spacing={1}>
                  <Text modifiers={[primary, font({ weight: 'semibold' }), lineLimit(1)]}>{p.title}</Text>
                  <Text modifiers={[footnote, secondary, lineLimit(1)]}>
                    {`${pollDate.format(new Date(p.postedAt))} · ${p.totalVotes} ${plural(p.totalVotes, ['голос', 'голоса', 'голосов'])}`}
                  </Text>
                </VStack>
                <Spacer />
              </CheckRow>
            );
          })
        )}
      </Section>

      {current && value && (
        <Section title="Кто ответил" footer={<Text>Число — клиенты с привязанным Telegram; «из N» — всего голосов. «Не голосовали» — участники чата, которых видел бот, без голоса в этом опросе.</Text>}>
          {current.options.map((o) => (
            <Toggle
              key={o.index}
              label={`${o.label} · ${o.clients}${o.votes !== o.clients ? ` из ${o.votes}` : ''}`}
              isOn={value.options.includes(o.index)}
              onIsOnChange={(on) => onChange({ ...value, options: on ? [...value.options, o.index] : value.options.filter((i) => i !== o.index) })}
            />
          ))}
          <Toggle label={`Не голосовали · ${current.notVoted.clients}`} isOn={value.notVoted} onIsOnChange={(on) => onChange({ ...value, notVoted: on })} />
        </Section>
      )}
    </>
  );
}
