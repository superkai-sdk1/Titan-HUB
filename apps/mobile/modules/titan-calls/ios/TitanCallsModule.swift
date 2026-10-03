import ExpoModulesCore

/// Мост JS ↔ «звонки» персоналу: токен VoIP для сервера и принятые звонки.
public class TitanCallsModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("TitanCalls")

    Events("onVoipToken", "onCallAnswered")

    OnCreate {
      TitanCallManager.shared.start()
    }

    OnStartObserving {
      let center = NotificationCenter.default
      self.observers.append(center.addObserver(forName: TitanCallManager.tokenDidChange, object: nil, queue: .main) { [weak self] note in
        self?.sendEvent("onVoipToken", ["token": (note.userInfo?["token"] as? String) ?? ""])
      })
      self.observers.append(center.addObserver(forName: TitanCallManager.callAnswered, object: nil, queue: .main) { [weak self] note in
        // Событие получил JS — повторно при запуске открывать не нужно.
        _ = TitanCallManager.shared.consumePending()
        self?.sendEvent("onCallAnswered", (note.userInfo as? [String: Any]) ?? [:])
      })
    }

    OnStopObserving {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers.removeAll()
    }

    /// Токен PushKit (hex) или null, если iOS его ещё не выдала.
    Function("getVoipToken") { () -> String? in
      TitanCallManager.shared.voipToken
    }

    /// Звонок, принятый до запуска JS: {kind, checkId, spaceId} или null.
    Function("consumePendingCall") { () -> [String: Any]? in
      TitanCallManager.shared.consumePending()
    }
  }
}
