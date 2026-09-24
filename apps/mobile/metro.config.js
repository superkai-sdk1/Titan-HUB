// Metro-конфиг: на Android подменяем модули, у которых нет Android-реализации.
//
// Приложение написано под iOS 26: иконки — SF Symbols (expo-symbols), контролы —
// SwiftUI (@expo/ui/swift-ui). На Android нативных вью SwiftUI нет, поэтому
// `requireNativeView('ExpoUI', …)` падает, а SymbolView без android-имени рисует
// пустоту. Слой в src/compat/android воспроизводит те же API на React Native, и
// подмена делается здесь — чтобы 90 экранов остались без единой правки импортов.
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const COMPAT = path.resolve(__dirname, 'src/compat/android');
const ANDROID_ALIASES = {
  'expo-symbols': path.join(COMPAT, 'symbols.tsx'),
  // Штатный expo-glass-effect на Android рендерит пустой View — карточки теряют фон.
  'expo-glass-effect': path.join(COMPAT, 'glass-effect.tsx'),
  '@expo/ui/swift-ui': path.join(COMPAT, 'swift-ui/index.tsx'),
  '@expo/ui/swift-ui/modifiers': path.join(COMPAT, 'swift-ui/modifiers.ts'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const alias = ANDROID_ALIASES[moduleName];
  // Сам слой совместимости импортирует настоящие модули — иначе подмена замкнулась бы на себя.
  const fromCompat = context.originModulePath?.startsWith(COMPAT);
  if (platform === 'android' && alias && !fromCompat) {
    return { type: 'sourceFile', filePath: alias };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
