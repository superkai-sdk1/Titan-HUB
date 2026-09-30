import {
  Form,
  HStack,
  Host,
  ProgressView,
  Section,
  Text,
  TextField,
} from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  font,
  foregroundStyle,
  keyboardType,
  onSubmit,
  submitLabel,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useMutation } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { normalizeClubHost, useSession } from '@/lib/session';
import type { ClubContext } from '@/lib/types';
import { ToolbarButton } from '@/components/toolbar';
import { colors } from '@/lib/theme';

/** Выбор клуба: API различает клубы только по поддомену. */
export default function ClubScreen() {
  const [input, setInput] = useState('');
  const host = normalizeClubHost(input);

  const check = useMutation({
    mutationFn: async (clubHost: string) => {
      const ctx = await api.get<ClubContext>('/club/context', { host: clubHost, auth: false });
      if (ctx.club && ctx.subscription?.blocked) {
        throw new ApiError(402, 'Подписка клуба закончилась — продлите её, чтобы войти');
      }
      return { ctx, clubHost };
    },
    onSuccess: async ({ ctx, clubHost }) => {
      haptic.success();
      await useSession.getState().setClub({
        host: clubHost,
        slug: ctx.club?.slug ?? null,
        name: ctx.club?.name ?? 'Titan HUB',
      });
    },
    onError: () => haptic.error(),
  });

  const submit = () => {
    if (host && !check.isPending) check.mutate(host);
  };

  const errorText =
    check.error instanceof ApiError && check.error.status === 404
      ? 'Клуб с таким адресом не найден'
      : check.error?.message;

  return (
    <>
      <Stack.Title large>Titan HUB</Stack.Title>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="done" tintColor={colors.accent} disabled={!host || check.isPending} onPress={submit}>
          Далее
        </ToolbarButton>
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section
            title="Адрес клуба"
            footer={
              <Text>
                Тот же адрес, что открываете в браузере. Обычно это название клуба латиницей, например kbr.
              </Text>
            }>
            <HStack spacing={2}>
              <TextField
                placeholder="kbr"
                autoFocus
                onTextChange={setInput}
                modifiers={[
                  keyboardType('ascii-capable'),
                  textInputAutocapitalization('never'),
                  autocorrectionDisabled(),
                  submitLabel('next'),
                  onSubmit(submit),
                ]}
              />
              {!input.includes('.') && (
                <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                  .titanpos.ru
                </Text>
              )}
            </HStack>
          </Section>

          {check.isPending && (
            <Section>
              <HStack spacing={10}>
                <ProgressView />
                <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                  Проверяем клуб…
                </Text>
              </HStack>
            </Section>
          )}

          {check.isError && !check.isPending && (
            <Section>
              <Text modifiers={[foregroundStyle('red'), font({ textStyle: 'callout' })]}>{errorText ?? 'Не удалось проверить клуб'}</Text>
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
