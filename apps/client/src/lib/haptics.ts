import * as Haptics from 'expo-haptics';

// Тактильные отклики: лёгкий — нажатия, выбор — переключатели, успех/ошибка — оплата.
export const haptic = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  soft: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}),
  select: () => void Haptics.selectionAsync().catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
