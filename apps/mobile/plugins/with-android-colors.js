// Палитра Titan как ресурсы Android с ночным вариантом.
//
// Цвета текста нельзя брать из атрибутов темы (?android:attr/textColorPrimary):
// тема Activity у Expo-приложения остаётся светлой, даже когда система в тёмной,
// и подписи получаются тёмными на тёмном фоне — экран выглядит пустым.
// Ресурсы же выбираются по КОНФИГУРАЦИИ устройства (values-night), поэтому
// совпадают с тем, что видит useColorScheme() на стороне JS.
const { withAndroidColors, withAndroidColorsNight, AndroidConfig } = require('expo/config-plugins');

const { assignColorValue } = AndroidConfig.Colors;

// Значения повторяют семантические цвета iOS, чтобы платформы выглядели одинаково.
const LIGHT = {
  titan_label: '#FF000000',
  titan_secondary_label: '#993C3C43',
  titan_tertiary_label: '#4D3C3C43',
  titan_separator: '#4A3C3C43',
  titan_background: '#FFFFFFFF',
  titan_grouped_background: '#FFF2F2F7',
  titan_card: '#14808080',
  titan_fill: '#1F767680',
  titan_floating: '#FFFFFFFF',
};

const DARK = {
  titan_label: '#FFFFFFFF',
  titan_secondary_label: '#99EBEBF5',
  titan_tertiary_label: '#4DEBEBF5',
  titan_separator: '#A6545458',
  titan_background: '#FF000000',
  titan_grouped_background: '#FF000000',
  titan_card: '#1FFFFFFF',
  titan_fill: '#3D767680',
  titan_floating: '#FF1C1C1E',
};

const apply = (colors, values) =>
  Object.entries(values).reduce((acc, [name, value]) => assignColorValue(acc, { name, value }), colors);

module.exports = function withTitanColors(config) {
  config = withAndroidColors(config, (cfg) => {
    cfg.modResults = apply(cfg.modResults, LIGHT);
    return cfg;
  });
  return withAndroidColorsNight(config, (cfg) => {
    cfg.modResults = apply(cfg.modResults, DARK);
    return cfg;
  });
};
