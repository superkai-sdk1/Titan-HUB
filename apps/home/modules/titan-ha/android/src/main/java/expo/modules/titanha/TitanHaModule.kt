package expo.modules.titanha

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * Мост JS ↔ нативное соединение с Home Assistant. Экран лишь показывает состояние
 * (событие onChange со снимком) и отправляет команды; соединение держит HaService.
 */
class TitanHaModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not ready")

  private val onChange: () -> Unit = {
    sendEvent("onChange", mapOf("snapshot" to HaClient.snapshot()))
  }

  override fun definition() = ModuleDefinition {
    Name("TitanHa")

    Events("onChange")

    OnStartObserving("onChange") { HaClient.addListener(onChange) }

    OnStopObserving("onChange") { HaClient.removeListener(onChange) }

    /** {status, error, entities} — текущее состояние, JSON-строкой. */
    Function("getSnapshot") { HaClient.snapshot() }

    /** Адрес и токен из Titan HUB + устройства кабинки: сохранить на планшете и держать связь. */
    Function("configure") { url: String, token: String, entityIds: List<String> ->
      val cfg = HaConfig(url, token, entityIds.sorted())
      HaPrefs.save(context, cfg)
      HaService.start(context)
      HaClient.start(context, cfg)
    }

    /** Home Assistant отключён в Titan HUB или планшет отвязан от клуба. */
    Function("stop") {
      HaPrefs.clear(context)
      HaService.stop(context)
      HaClient.stop()
    }

    Function("reconnect") { HaClient.reconnectNow() }

    AsyncFunction("callService") { domain: String, service: String, entityId: String, dataJson: String, promise: Promise ->
      val payload = JSONObject()
        .put("type", "call_service")
        .put("domain", domain)
        .put("service", service)
        .put("service_data", JSONObject(dataJson))
        .put("target", JSONObject().put("entity_id", entityId))
      HaClient.request(payload, 10_000) { _, err ->
        if (err != null) promise.reject("ERR_HA", err, null) else promise.resolve(null)
      }
    }

    AsyncFunction("getStates") { promise: Promise ->
      HaClient.request(JSONObject().put("type", "get_states"), 20_000) { result, err ->
        if (err != null) promise.reject("ERR_HA", err, null) else promise.resolve(result?.toString() ?: "[]")
      }
    }
  }
}
