import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useDialogStore, type DialogButton, type DialogRequest } from '@/lib/dialog';
import { haptic } from '@/lib/haptics';
import { colors, radius, space, type, useAccentHex } from '@/lib/theme';

/**
 * Android-диалоги из `lib/dialog.ts`: поле ввода вместо отсутствующего `Alert.prompt`
 * и список действий, когда их больше трёх. На iOS ничего не рисует — там системные Alert.
 */
export function DialogHost() {
  const current = useDialogStore((s) => s.queue[0]);
  if (Platform.OS === 'ios' || !current) return null;
  // key — новый диалог получает свежее поле ввода, а не текст предыдущего.
  return <Dialog key={current.id} request={current} />;
}

function Dialog({ request }: { request: DialogRequest }) {
  const accent = useAccentHex();
  const [value, setValue] = useState(request.defaultValue ?? '');
  const cancel = request.buttons.find((b) => b.style === 'cancel');

  const press = (button?: DialogButton) => {
    useDialogStore.getState().shift();
    button?.onPress?.(request.kind === 'prompt' ? value : undefined);
  };

  // Основное действие поля — последняя не-отменяющая кнопка, как «Готово» в Alert.prompt.
  const primary = [...request.buttons].reverse().find((b) => b.style !== 'cancel');

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => press(cancel)}>
      <Pressable style={styles.backdrop} onPress={() => press(cancel)}>
        {/* Карточка перехватывает касания, чтобы тап по ней не закрывал диалог. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={[type.title3, styles.title]}>{request.title}</Text>
          {request.message ? <Text style={[type.subhead, styles.message]}>{request.message}</Text> : null}

          {request.kind === 'prompt' ? (
            <>
              <TextInput
                value={value}
                onChangeText={setValue}
                autoFocus
                selectTextOnFocus
                secureTextEntry={request.secure}
                keyboardType={request.keyboardType}
                selectionColor={accent}
                cursorColor={accent}
                placeholderTextColor={colors.tertiaryLabel}
                returnKeyType="done"
                onSubmitEditing={() => press(primary)}
                style={[type.body, styles.input, { borderBottomColor: accent }]}
              />
              <View style={styles.actions}>
                {request.buttons.map((button, index) => (
                  <Pressable
                    key={index}
                    onPress={() => {
                      haptic.selection();
                      press(button);
                    }}
                    style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                    accessibilityRole="button">
                    <Text
                      style={[
                        type.headline,
                        { color: button.style === 'destructive' ? colors.red : button.style === 'cancel' ? colors.secondaryLabel : accent },
                      ]}>
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.list}>
              {/* Отмена — всегда внизу списка, как в листе действий. */}
              {[...request.buttons.filter((b) => b.style !== 'cancel'), ...(cancel ? [cancel] : [])].map((button, index) => (
                <Pressable
                  key={index}
                  onPress={() => {
                    haptic.selection();
                    press(button);
                  }}
                  style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <Text
                    style={[
                      type.body,
                      styles.rowText,
                      button.style === 'destructive' && { color: colors.red },
                      button.style === 'cancel' && { color: colors.secondaryLabel },
                      button.style !== 'destructive' && button.style !== 'cancel' && { color: accent, fontWeight: '600' },
                    ]}>
                    {button.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space.xxl },
  card: {
    backgroundColor: colors.floating,
    borderRadius: radius.card,
    paddingTop: space.xl,
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
    gap: space.sm,
    elevation: 12,
  },
  title: { color: colors.label },
  message: { color: colors.secondaryLabel },
  input: { color: colors.label, borderBottomWidth: 2, paddingVertical: space.sm, marginTop: space.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs, marginTop: space.sm },
  action: { paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.small },
  list: { marginTop: space.xs, marginHorizontal: -space.xl },
  row: { paddingVertical: space.lg, paddingHorizontal: space.xl },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  rowText: { color: colors.label, textAlign: 'center' },
  pressed: { opacity: 0.55 },
});
