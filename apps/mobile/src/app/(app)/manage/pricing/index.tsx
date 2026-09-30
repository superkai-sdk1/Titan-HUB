import { Form, Host, ProgressView, Section, Text } from '@expo/ui/swift-ui';
import { refreshable } from '@expo/ui/swift-ui/modifiers';
import { Stack, useRouter } from 'expo-router';

import { ActionRow, LinkRow } from '@/components/native-form';
import { SPACE_LOOK, useEveningTypesAdmin, useSpacesAdmin, useTariffsAdmin } from '@/lib/catalog-api';
import { useEventRates } from '@/lib/events-api';
import { formatMoney, plural, toNumber } from '@/lib/format';
import { SPACE_TYPE_LABEL } from '@/lib/pos-api';
import { queryClient } from '@/lib/query';
import { useClubKey } from '@/lib/queries';
import { useSession } from '@/lib/session';

const hex = (value: string | null | undefined, fallback: string) => (value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

type Editor = '/manage/pricing/tariff' | '/manage/pricing/evening' | '/manage/pricing/space' | '/manage/pricing/rate';

/**
 * Тарифы и аренда — один список по разделам, как в «Настройках» iOS: статусы клиентов,
 * обычные тарифы (и скрытые — их можно вернуть), типы вечеров, зоны аренды и пакеты
 * мероприятий. Каждая строка открывает свой редактор; «Добавить…» — в конце раздела.
 * Раньше справочник был разбит на вкладки, а редакторы-шторки не прокручивались:
 * клавиатура закрывала сумму и «Сохранить». Менять может только владелец.
 */
export default function PricingScreen() {
  const router = useRouter();
  const club = useClubKey();
  const isOwner = useSession((s) => s.user?.role === 'owner');
  const tariffs = useTariffsAdmin();
  const evenings = useEveningTypesAdmin();
  const spaces = useSpacesAdmin();
  const rates = useEventRates();

  const refresh = async () => {
    await Promise.allSettled([queryClient.refetchQueries({ queryKey: [club, 'pricing'], type: 'active' }), spaces.refetch()]);
  };

  const all = tariffs.data ?? [];
  const statuses = all.filter((t) => t.key && t.isActive !== false);
  const plain = all.filter((t) => !t.key && t.isActive !== false);
  const hidden = all.filter((t) => t.isActive === false);
  const open = (pathname: Editor, params?: Record<string, string>) => (isOwner ? () => router.push({ pathname, params }) : undefined);

  return (
    <>
      <Stack.Title>Тарифы и аренда</Stack.Title>
      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        {tariffs.isLoading || spaces.isLoading ? (
          <ProgressView />
        ) : (
          <Form modifiers={[refreshable(refresh)]}>
            <Section title="Статусы клиентов" footer={<Text>Статус и тариф — одно и то же: касса предлагает игроку сумму за вечер по его статусу.</Text>}>
              {statuses.map((t) => (
                <LinkRow
                  key={t.id}
                  icon="person.crop.circle.badge.checkmark"
                  color={hex(t.color, '#8B5CF6')}
                  title={t.name}
                  value={formatMoney(toNumber(t.price))}
                  onPress={open('/manage/pricing/tariff', { tariffId: t.id })}
                />
              ))}
            </Section>

            <Section title="Тарифы" footer={<Text>Тарифы без статуса — например, «Одна игра». Касса добавляет их в чек как позицию.</Text>}>
              {plain.map((t) => (
                <LinkRow
                  key={t.id}
                  icon="ticket"
                  color={hex(t.color, '#8B5CF6')}
                  title={t.name}
                  value={formatMoney(toNumber(t.price))}
                  onPress={open('/manage/pricing/tariff', { tariffId: t.id })}
                />
              ))}
              {isOwner && <ActionRow title="Добавить тариф" icon="plus.circle.fill" onPress={() => router.push('/manage/pricing/tariff')} />}
            </Section>

            {hidden.length > 0 && (
              <Section title="Скрытые" footer={<Text>Убраны из кассы. Прошлые чеки их сохранили, а тариф можно вернуть.</Text>}>
                {hidden.map((t) => (
                  <LinkRow
                    key={t.id}
                    icon="eye.slash"
                    color="#8E8E93"
                    title={t.name}
                    value={formatMoney(toNumber(t.price))}
                    onPress={open('/manage/pricing/tariff', { tariffId: t.id })}
                  />
                ))}
              </Section>
            )}

            <Section title="Типы вечеров" footer={<Text>Тип вечера выбирают при открытии смены — по нему считаются игровые вечера в аналитике.</Text>}>
              {(evenings.data ?? []).map((e) => (
                <LinkRow
                  key={e.key}
                  icon="moon.stars"
                  color={hex(e.color, '#10B981')}
                  title={e.label}
                  value={e.isSystem || e.key === 'none' ? 'системный' : undefined}
                  onPress={open('/manage/pricing/evening', { key: e.key })}
                />
              ))}
              {isOwner && <ActionRow title="Добавить тип вечера" icon="plus.circle.fill" onPress={() => router.push('/manage/pricing/evening')} />}
            </Section>

            <Section title="Зоны аренды" footer={<Text>Почасовая ставка зоны. К зоне привязывается планшет кабинки; выключенная зона не предлагается при аренде.</Text>}>
              {(spaces.data ?? []).map((s) => (
                <LinkRow
                  key={s.id}
                  icon={SPACE_LOOK[s.type]?.symbol ?? 'square.grid.2x2'}
                  color={s.isActive ? (SPACE_LOOK[s.type]?.color ?? '#94A3B8') : '#8E8E93'}
                  title={s.name}
                  subtitle={[SPACE_TYPE_LABEL[s.type], s.capacity ? `${s.capacity} чел.` : null, s.isActive ? null : 'выключена'].filter(Boolean).join(' · ')}
                  value={`${formatMoney(toNumber(s.hourlyRate))}/ч`}
                  onPress={open('/manage/pricing/space', { spaceId: s.id })}
                />
              ))}
              {isOwner && <ActionRow title="Добавить зону" icon="plus.circle.fill" onPress={() => router.push('/manage/pricing/space')} />}
            </Section>

            <Section
              title="Пакеты мероприятий"
              footer={
                <Text>
                  {isOwner
                    ? 'Цена за весь период — основа чека мероприятия «Пакет по часам». Нет пакета на нужное число часов — берётся ближний меньший и оставшиеся часы по его ставке.'
                    : 'Изменять справочник может только владелец.'}
                </Text>
              }>
              {(rates.data ?? []).map((r) => (
                <LinkRow
                  key={r.hours}
                  icon="clock"
                  color="#A78BFA"
                  title={`${r.hours} ${plural(r.hours, ['час', 'часа', 'часов'])}`}
                  subtitle={r.hours > 1 ? `${formatMoney(Math.round(toNumber(r.price) / r.hours))} в час` : undefined}
                  value={formatMoney(toNumber(r.price))}
                  onPress={open('/manage/pricing/rate', { hours: String(r.hours) })}
                />
              ))}
              {isOwner && <ActionRow title="Добавить пакет" icon="plus.circle.fill" onPress={() => router.push('/manage/pricing/rate')} />}
            </Section>
          </Form>
        )}
      </Host>
    </>
  );
}
