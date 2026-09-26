import { Alert, Platform, type AlertButton, type KeyboardTypeOptions } from 'react-native';
import { create } from 'zustand';

/**
 * Системные диалоги, которые на Android ведут себя иначе, чем на iOS.
 *
 * - `Alert.prompt` существует только на iOS: на Android вызов молча ничего не делает,
 *   и действие (сумма части оплаты, код сертификата, причина списания) просто не
 *   происходит. `promptText` на Android показывает свой диалог с полем ввода.
 * - `Alert.alert` на Android рисует не больше трёх кнопок, остальные отбрасывает — в
 *   диалоге «Сохранить перед выходом?» пропадала «Остаться». `chooseAction` на Android
 *   показывает такие наборы списком.
 *
 * На iOS обе функции — прямые вызовы системных Alert, поведение не меняется.
 * Сами Android-диалоги рисует `components/dialog-host.tsx` в корне приложения.
 */

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  /** Для диалога с полем приходит введённый текст. */
  onPress?: (value?: string) => void;
};

export type DialogRequest = {
  id: number;
  kind: 'prompt' | 'choices';
  title: string;
  message?: string;
  buttons: DialogButton[];
  defaultValue?: string;
  keyboardType?: KeyboardTypeOptions;
  secure?: boolean;
};

type DialogStore = {
  queue: DialogRequest[];
  push: (request: Omit<DialogRequest, 'id'>) => void;
  /** Снимает верхний диалог; следующий в очереди показывается сам. */
  shift: () => void;
};

let nextId = 1;

export const useDialogStore = create<DialogStore>((set) => ({
  queue: [],
  push: (request) => set((state) => ({ queue: [...state.queue, { ...request, id: nextId++ }] })),
  shift: () => set((state) => ({ queue: state.queue.slice(1) })),
}));

/** Та же сигнатура, что у `Alert.prompt`, — чтобы замена была механической. */
export function promptText(
  title: string,
  message?: string,
  buttons: DialogButton[] = [{ text: 'OK' }],
  type: 'plain-text' | 'secure-text' = 'plain-text',
  defaultValue = '',
  keyboardType: KeyboardTypeOptions = 'default',
): void {
  if (Platform.OS === 'ios') {
    Alert.prompt(title, message, buttons as AlertButton[], type, defaultValue, keyboardType);
    return;
  }
  useDialogStore.getState().push({
    kind: 'prompt',
    title,
    message,
    buttons,
    defaultValue,
    keyboardType,
    secure: type === 'secure-text',
  });
}

/** `Alert.alert`, которому можно передать больше трёх кнопок. */
export function chooseAction(title: string, message: string | undefined, buttons: DialogButton[]): void {
  if (Platform.OS === 'ios' || buttons.length <= 3) {
    Alert.alert(title, message, buttons as AlertButton[], { cancelable: true });
    return;
  }
  useDialogStore.getState().push({ kind: 'choices', title, message, buttons });
}
