// Ориентация на Android: телефон — только портрет, планшет — любая.
//
// На iPhone приложение закреплено в портрете (UISupportedInterfaceOrientations), а на
// Android `orientation: "default"` давало поворот и телефону — вёрстка кассы и шторок в
// альбомной ориентации телефона не рассчитана. Запретить поворот в манифесте нельзя
// выборочно: тогда закрепился бы и планшет, где касса как раз работает в альбомной.
// Поэтому решение принимается в MainActivity по короткой стороне экрана (sw600dp).
const { withMainActivity } = require('expo/config-plugins');

const MARK = '// titan: phone-portrait';

module.exports = function withAndroidPhonePortrait(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('with-android-phone-portrait: ожидается MainActivity.kt');
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;

    src = src.replace(
      'super.onCreate(null)',
      [
        'super.onCreate(null)',
        `    ${MARK}`,
        '    if (resources.configuration.smallestScreenWidthDp < 600) {',
        '      requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT',
        '    }',
      ].join('\n'),
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
