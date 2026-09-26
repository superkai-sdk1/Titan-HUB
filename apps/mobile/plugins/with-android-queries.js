// Видимость чужих приложений на Android 11+.
//
// С Android 11 `Linking.canOpenURL('yandexmaps://…')` возвращает false для любого
// приложения, которое не объявлено в <queries> манифеста, — даже если оно установлено.
// Маршрут до выезда поэтому всегда уходил в браузер. Это двойник
// LSApplicationQueriesSchemes из ios.infoPlist: те же схемы.
const { withAndroidManifest } = require('expo/config-plugins');

const SCHEMES = ['yandexmaps', 'yandexnavi', 'tg', 'whatsapp'];

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries ?? [{}];
    const queries = manifest.queries[0];
    queries.intent = queries.intent ?? [];

    const declared = new Set(
      queries.intent.flatMap((intent) => (intent.data ?? []).map((data) => data.$?.['android:scheme'])).filter(Boolean),
    );
    for (const scheme of SCHEMES) {
      if (declared.has(scheme)) continue;
      queries.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      });
    }
    return cfg;
  });
};
