export type ToolbarTextButtonProps = {
  title: string;
  variant?: 'plain' | 'done' | 'prominent';
  disabled?: boolean;
  onPress?: () => void;
};

/** На iOS текстовые кнопки шапки рисует сам Stack.Toolbar.Button — двойник не нужен. */
export function ToolbarTextButton(_props: ToolbarTextButtonProps) {
  return null;
}
