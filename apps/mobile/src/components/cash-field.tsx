import { TextField, useNativeState } from '@expo/ui/swift-ui';
import { font, keyboardType, monospacedDigit } from '@expo/ui/swift-ui/modifiers';

/**
 * Поле суммы наличных. Начальное значение задаётся при появлении поля — поэтому родитель
 * рисует его, только когда предзаполнение (остаток кассы) уже известно.
 */
export function CashField({ initial, onChange, autoFocus }: { initial: string; onChange: (text: string) => void; autoFocus?: boolean }) {
  const text = useNativeState(initial);
  return (
    <TextField
      text={text}
      placeholder="0"
      autoFocus={autoFocus}
      onTextChange={onChange}
      modifiers={[keyboardType('decimal-pad'), font({ size: 28, weight: 'semibold', design: 'rounded' }), monospacedDigit()]}
    />
  );
}
