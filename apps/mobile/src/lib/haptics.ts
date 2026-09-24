import * as Haptics from 'expo-haptics';

const run = (p: Promise<void>) => {
  p.catch(() => {});
};

/** Тактильный отклик. Таблица моментов — в плане, раздел «Анимации и отклик». */
export const haptic = {
  selection: () => run(Haptics.selectionAsync()),
  light: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
