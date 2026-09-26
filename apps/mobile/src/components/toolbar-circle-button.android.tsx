import { FilledTonalIconButton, Host, Icon } from '@expo/ui/jetpack-compose';
import type { ImageSourcePropType } from 'react-native';
import { useColorScheme } from 'react-native';

export type ToolbarCircleButtonProps = {
  source?: ImageSourcePropType;
  label?: string;
  disabled?: boolean;
  onPress?: () => void;
  /** Кнопка вне тулбара (например, «назад» в headerLeft) — ей нужен свой Compose-хост. */
  standalone?: boolean;
};

/**
 * Круглая кнопка шапки Android — как стеклянные кнопки шапки iOS 26: светлая
 * полупрозрачная «таблетка» с иконкой поверх фирменного градиента. Нативная кнопка
 * Material 3 (FilledTonalIconButton), потому что дети тулбара живут в Compose-строке шапки.
 */
export function ToolbarCircleButton({ source, label, disabled, onPress, standalone }: ToolbarCircleButtonProps) {
  const dark = useColorScheme() === 'dark';
  const content = dark ? '#FFFFFF' : '#1C1C1E';
  const button = (
    <FilledTonalIconButton
      onClick={onPress}
      enabled={!disabled}
      colors={{
        containerColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.72)',
        contentColor: content,
        disabledContainerColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.4)',
        disabledContentColor: dark ? 'rgba(255,255,255,0.35)' : 'rgba(28,28,30,0.35)',
      }}>
      {source ? <Icon source={source} tint={disabled ? (dark ? 'rgba(255,255,255,0.35)' : 'rgba(28,28,30,0.35)') : content} size={22} contentDescription={label} /> : null}
    </FilledTonalIconButton>
  );
  return standalone ? <Host matchContents>{button}</Host> : button;
}
