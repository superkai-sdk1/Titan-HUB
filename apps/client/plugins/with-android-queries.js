// Видимость Telegram на Android 11+: без <queries> система скрывает чужие приложения,
// и открытие tg:// может уйти мимо. Двойник LSApplicationQueriesSchemes из app.json.
const { withAndroidManifest } = require('expo/config-plugins');

const SCHEMES = ['tg'];

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
