// expo-contacts 57.0.5 роняет приложение на старте.
//
// В его podspec объявлен `test_spec` с зависимостью ExpoModulesTestCore. CocoaPods
// протаскивает из него Swift Testing в линковку САМОГО фреймворка, и на устройстве
// приложение падает ещё до JS:
//   dyld: Library not loaded: @rpath/Testing.framework/Testing
//         Referenced from: .../ExpoContacts.framework/ExpoContacts
// (Testing.framework есть только в тестовых сборках, в системе устройства его нет.)
//
// Плагин вырезает тестовую секцию из podspec перед `pod install`. Тесты модуля нам
// не нужны, а правка переживает и prebuild, и переустановку зависимостей.
const fs = require('fs');
const path = require('path');

const { withDangerousMod } = require('expo/config-plugins');

const TEST_SPEC = /\n\s*s\.test_spec\s+'Tests'\s+do\s+\|test_spec\|[\s\S]*?\n\s*end\n/;

function withContactsTestingFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podspec = path.join(cfg.modRequest.projectRoot, 'node_modules/expo-contacts/ios/ExpoContacts.podspec');
      if (!fs.existsSync(podspec)) return cfg;
      const source = fs.readFileSync(podspec, 'utf8');
      if (!TEST_SPEC.test(source)) return cfg;
      fs.writeFileSync(podspec, source.replace(TEST_SPEC, '\n'), 'utf8');
      return cfg;
    },
  ]);
}

module.exports = withContactsTestingFix;
