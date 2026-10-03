import CallKit
import PushKit
import UIKit

/// «Звонки» персоналу из Titan Home: гость написал в чат или нажал «Позвать», а за
/// 30 секунд никто не прочитал — сервер присылает VoIP-push, iPhone звонит через
/// CallKit, как мессенджер. Разговора нет: «Ответить» подтверждает вызов на сервере
/// (у остальных звонок гаснет) и открывает Titan HUB на нужном чате.
///
/// Требования iOS: на каждый VoIP-push нужно сразу сообщить CallKit о звонке — даже
/// на «отмену» (сообщаем и тут же завершаем), иначе система перестанет будить приложение.
final class TitanCallManager: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
  static let shared = TitanCallManager()
  static let tokenDidChange = Notification.Name("TitanCallsVoipToken")
  static let callAnswered = Notification.Name("TitanCallsAnswered")

  private static let tokenKey = "titan.calls.voipToken"
  private static let pendingKey = "titan.calls.pending"

  private var registry: PKPushRegistry?
  private let provider: CXProvider
  private var calls: [UUID: [String: Any]] = [:]
  private var timeouts: [UUID: DispatchWorkItem] = [:]

  private override init() {
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.generic]
    config.includesCallsInRecents = false
    provider = CXProvider(configuration: config)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  func start() {
    guard registry == nil else { return }
    let r = PKPushRegistry(queue: .main)
    r.delegate = self
    r.desiredPushTypes = [.voIP]
    registry = r
  }

  var voipToken: String? { UserDefaults.standard.string(forKey: Self.tokenKey) }

  /// Звонок приняли, пока JS не был запущен: экран откроется на нужном чате при старте.
  func consumePending() -> [String: Any]? {
    let defaults = UserDefaults.standard
    guard let pending = defaults.dictionary(forKey: Self.pendingKey) else { return nil }
    defaults.removeObject(forKey: Self.pendingKey)
    if let at = pending["at"] as? Double, Date().timeIntervalSince1970 - at > 600 { return nil }
    return pending
  }

  // MARK: PushKit

  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    UserDefaults.standard.set(token, forKey: Self.tokenKey)
    NotificationCenter.default.post(name: Self.tokenDidChange, object: nil, userInfo: ["token": token])
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    UserDefaults.standard.removeObject(forKey: Self.tokenKey)
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    let data = payload.dictionaryPayload as? [String: Any] ?? [:]
    let uuid = (data["callId"] as? String).flatMap(UUID.init(uuidString:)) ?? UUID()

    if (data["type"] as? String) == "cancel" {
      if calls[uuid] != nil {
        endCall(uuid, reason: .answeredElsewhere)
        completion()
      } else {
        // Звонок уже погас у нас (отклонили / истёк) — всё равно обязаны сообщить CallKit.
        report(uuid: uuid, name: "Titan HUB") { [weak self] in
          self?.provider.reportCall(with: uuid, endedAt: Date(), reason: .answeredElsewhere)
          completion()
        }
      }
      return
    }

    calls[uuid] = data
    let caller = (data["caller"] as? String) ?? "Titan HUB"
    let subtitle = data["subtitle"] as? String
    let name = subtitle.map { "\(caller): \($0)" } ?? caller
    report(uuid: uuid, name: String(name.prefix(80))) { completion() }

    // Никто не ответил 45 секунд — гасим сами, как пропущенный.
    let timeout = DispatchWorkItem { [weak self] in self?.endCall(uuid, reason: .unanswered) }
    timeouts[uuid] = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: timeout)
  }

  private func report(uuid: UUID, name: String, done: @escaping () -> Void) {
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: name)
    update.localizedCallerName = name
    update.hasVideo = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    provider.reportNewIncomingCall(with: uuid, update: update) { _ in done() }
  }

  private func endCall(_ uuid: UUID, reason: CXCallEndedReason) {
    timeouts.removeValue(forKey: uuid)?.cancel()
    guard calls.removeValue(forKey: uuid) != nil else { return }
    provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
  }

  // MARK: CallKit

  func providerDidReset(_ provider: CXProvider) {
    timeouts.values.forEach { $0.cancel() }
    timeouts.removeAll()
    calls.removeAll()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    let uuid = action.callUUID
    let data = calls[uuid] ?? [:]
    action.fulfill()
    acknowledge(data)

    // Куда вести при открытии: JS получит событие сразу или заберёт при запуске.
    let pending: [String: Any] = [
      "kind": (data["kind"] as? String) ?? "",
      "checkId": (data["checkId"] as? String) ?? "",
      "spaceId": (data["spaceId"] as? String) ?? "",
      "at": Date().timeIntervalSince1970,
    ]
    UserDefaults.standard.set(pending, forKey: Self.pendingKey)
    NotificationCenter.default.post(name: Self.callAnswered, object: nil, userInfo: pending)

    // Разговора нет — завершаем звонок, как только система его приняла.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
      self?.endCall(uuid, reason: .remoteEnded)
    }
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    timeouts.removeValue(forKey: action.callUUID)?.cancel()
    calls.removeValue(forKey: action.callUUID)
    action.fulfill()
  }

  /// «Ответил» — серверу: вызов прочитан, у остальных звонок гаснет. Без авторизации,
  /// по одноразовому ключу из push: приложение может быть ещё не запущено.
  private func acknowledge(_ data: [String: Any]) {
    guard
      let urlString = data["ackUrl"] as? String,
      let url = URL(string: urlString),
      let key = data["ackKey"] as? String
    else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 15
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["key": key, "device": UIDevice.current.name])

    var task: UIBackgroundTaskIdentifier = .invalid
    task = UIApplication.shared.beginBackgroundTask {
      UIApplication.shared.endBackgroundTask(task)
    }
    URLSession.shared.dataTask(with: request) { _, _, _ in
      DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(task) }
    }.resume()
  }
}
