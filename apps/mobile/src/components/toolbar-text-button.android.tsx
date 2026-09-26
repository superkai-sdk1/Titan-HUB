import { Button, Text, TextButton } from '@expo/ui/jetpack-compose';

import { useAccentHex } from '@/lib/theme';

export type ToolbarTextButtonProps = {
  title: string;
  variant?: 'plain' | 'done' | 'prominent';
  disabled?: boolean;
  onPress?: () => void;
};

/**
 * Текстовая кнопка шапки на Android («Далее», «Войти», «Открыть смену», «Готово»).
 *
 * expo-router на Android рисует `Stack.Toolbar.Button` только с картинкой-иконкой, а
 * кнопку с одним текстом молча выбрасывает (`if (!props.source) return null`). Из-за этого
 * на Android не было ни «Войти», ни «Открыть смену». Дети тулбара на Android живут
 * внутри Compose-строки шапки, поэтому здесь — нативные кнопки Material 3.
 */
export function ToolbarTextButton({ title, variant = 'plain', disabled, onPress }: ToolbarTextButtonProps) {
  const accent = useAccentHex();
  const label = <Text style={{ typography: 'labelLarge', fontWeight: variant === 'plain' ? '500' : 'bold' }}>{title}</Text>;
  if (variant === 'prominent') {
    return (
      <Button onClick={onPress} enabled={!disabled} colors={{ containerColor: accent, contentColor: '#FFFFFF' }}>
        {label}
      </Button>
    );
  }
  return (
    <TextButton onClick={onPress} enabled={!disabled} colors={{ contentColor: accent }}>
      {label}
    </TextButton>
  );
}
