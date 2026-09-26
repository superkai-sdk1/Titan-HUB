// Scene-based life cycle для iOS 27.
//
// Приложения, собранные с SDK iOS 27 (Xcode 27), должны использовать UIScene:
// иначе UIKit останавливает запуск (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
// В пакете expo 57 уже есть `ExpoAppSceneDelegate` (ObjC-имя `EXExpoAppSceneDelegate`),
// но шаблон prebuild SDK 57 его не подключает. Плагин:
//  1) объявляет сцену в Info.plist с этим делегатом;
//  2) AppDelegate реализует `ExpoReactNativeFactoryProvider` и только создаёт фабрику —
//     окно и запуск React Native делает делегат сцены.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const START_IN_WINDOW = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle: ожидается AppDelegate.swift');
    }
    let src = cfg.modResults.contents;

    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      );
    }

    if (START_IN_WINDOW.test(src)) {
      src = src.replace(
        START_IN_WINDOW,
        '\n    // Окно и запуск React Native — в ExpoAppSceneDelegate (scene life cycle, iOS 27).\n',
      );
    } else if (src.includes('factory.startReactNative(')) {
      throw new Error('with-scene-lifecycle: не удалось убрать запуск React Native из AppDelegate — шаблон изменился');
    }

    cfg.modResults.contents = src;
    return cfg;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
