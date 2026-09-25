import { Form, Host, Section, SecureField, Text, TextField } from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  foregroundStyle,
  onSubmit,
  submitLabel,
  textContentType,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useMutation } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import type { LoginResponse } from '@/lib/types';
import { ToolbarButton } from '@/components/toolbar';

export default function PasswordScreen() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () =>
      api.post<LoginResponse>(
        '/auth/login/password',
        { nickname: nickname.trim(), password },
        { auth: false },
      ),
    onSuccess: async (res) => {
      haptic.success();
      await useSession.getState().signIn(res.token, res.user);
    },
    onError: () => haptic.error(),
  });

  const canSubmit = nickname.trim().length > 0 && password.length > 0 && !login.isPending;
  const submit = () => {
    if (canSubmit) login.mutate();
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <ToolbarButton icon="xmark" accessibilityLabel="Закрыть" onPress={() => router.back()} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="prominent" disabled={!canSubmit} onPress={submit}>
          Войти
        </ToolbarButton>
      </Stack.Toolbar>

      <Host style={{ flex: 1 }} useViewportSizeMeasurement>
        <Form>
          <Section footer={<Text>Те же ник и пароль, что в веб-кассе.</Text>}>
            <TextField
              placeholder="Ник"
              autoFocus
              onTextChange={setNickname}
              modifiers={[
                textContentType('username'),
                textInputAutocapitalization('never'),
                autocorrectionDisabled(),
                submitLabel('next'),
              ]}
            />
            <SecureField
              placeholder="Пароль"
              onTextChange={setPassword}
              modifiers={[textContentType('password'), submitLabel('go'), onSubmit(submit)]}
            />
          </Section>
          {login.isError && (
            <Section>
              <Text modifiers={[foregroundStyle('red')]}>{login.error.message}</Text>
            </Section>
          )}
        </Form>
      </Host>
    </>
  );
}
