// «Звонки» персоналу (modules/titan-calls): iOS будит приложение VoIP-push (PushKit)
// и показывает входящий через CallKit. Нужны фоновые режимы voip и remote-notification;
// entitlement aps-environment добавляет плагин expo-notifications.
const { withInfoPlist } = require('expo/config-plugins');

const MODES = ['voip', 'remote-notification'];

module.exports = function withStaffCalls(config) {
  return withInfoPlist(config, (cfg) => {
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    for (const mode of MODES) modes.add(mode);
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });
};
