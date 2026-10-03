// Titan Home как домашний экран Android: MainActivity получает фильтр HOME, и
// кнопка «Домой» возвращает гостя в киоск. Без владельца устройства Android один
// раз спросит, какое приложение сделать домашним (выбрать Titan Home → «Всегда»);
// у владельца устройства это делает сам модуль titan-kiosk.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const HOME_CATEGORIES = ['android.intent.category.HOME', 'android.intent.category.DEFAULT'];

function hasHomeFilter(activity) {
  return (activity['intent-filter'] ?? []).some((filter) =>
    (filter.category ?? []).some((c) => c.$?.['android:name'] === 'android.intent.category.HOME'),
  );
}

module.exports = function withKiosk(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    if (!hasHomeFilter(activity)) {
      activity['intent-filter'] = activity['intent-filter'] ?? [];
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: HOME_CATEGORIES.map((name) => ({ $: { 'android:name': name } })),
      });
    }
    return cfg;
  });
};
