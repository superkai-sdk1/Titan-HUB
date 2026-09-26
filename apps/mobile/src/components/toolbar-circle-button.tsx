import type { ImageSourcePropType } from 'react-native';

export type ToolbarCircleButtonProps = {
  source?: ImageSourcePropType;
  label?: string;
  disabled?: boolean;
  onPress?: () => void;
  standalone?: boolean;
};

/** На iOS кнопки шапки рисует сам Stack.Toolbar (Liquid Glass) — двойник не нужен. */
export function ToolbarCircleButton(_props: ToolbarCircleButtonProps) {
  return null;
}
