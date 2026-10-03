import ExpoModulesCore

/// PushKit должен быть зарегистрирован при каждом запуске — в том числе когда iOS
/// будит приложение входящим VoIP-push, ещё до экрана и JS.
public class TitanCallsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    TitanCallManager.shared.start()
    return true
  }
}
