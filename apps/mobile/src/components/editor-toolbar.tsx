import { Stack, useRouter } from 'expo-router';

import { ToolbarButton } from '@/components/toolbar';
import { colors } from '@/lib/theme';

/**
 * Шапка редактора, как в системных формах iOS: «Отмена» слева, «Сохранить» справа.
 * Сохранить нельзя, пока форма не заполнена или запрос ещё идёт.
 */
export function EditorToolbar({
  title,
  canSave,
  busy,
  saveLabel = 'Сохранить',
  busyLabel = 'Сохраняем…',
  onSave,
}: {
  title: string;
  canSave: boolean;
  busy?: boolean;
  saveLabel?: string;
  busyLabel?: string;
  onSave: () => void;
}) {
  const router = useRouter();
  return (
    <>
      <Stack.Title>{title}</Stack.Title>
      <Stack.Toolbar placement="left">
        <ToolbarButton onPress={() => router.back()}>Отмена</ToolbarButton>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <ToolbarButton variant="done" tintColor={colors.accent} disabled={!canSave || busy} onPress={onSave}>
          {busy ? busyLabel : saveLabel}
        </ToolbarButton>
      </Stack.Toolbar>
    </>
  );
}
