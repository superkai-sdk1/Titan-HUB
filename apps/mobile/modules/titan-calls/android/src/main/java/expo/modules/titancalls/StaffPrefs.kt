package expo.modules.titancalls

import android.content.Context
import org.json.JSONObject

/** Куда подключаться (клуб и токен сотрудника) и какие типы уведомлений он выключил. */
data class StaffConfig(val origin: String, val token: String, val disabled: Set<String>)

/**
 * Хранится на телефоне: служба поднимается после перезагрузки сама, без запуска
 * приложения. Выход сотрудника стирает всё (StaffPrefs.clear).
 */
object StaffPrefs {
  private const val NAME = "titan_staff_calls"
  private const val PENDING_TTL_MS = 10 * 60_000L

  private fun prefs(context: Context) = context.getSharedPreferences(NAME, Context.MODE_PRIVATE)

  fun load(context: Context): StaffConfig? {
    val p = prefs(context)
    val origin = p.getString("origin", null) ?: return null
    val token = p.getString("token", null) ?: return null
    val disabled = (p.getString("disabled", "") ?: "").split(',').filter { it.isNotBlank() }.toSet()
    return StaffConfig(origin, token, disabled)
  }

  fun save(context: Context, cfg: StaffConfig) {
    prefs(context).edit()
      .putString("origin", cfg.origin)
      .putString("token", cfg.token)
      .putString("disabled", cfg.disabled.joinToString(","))
      .commit()
  }

  fun clear(context: Context) {
    prefs(context).edit().remove("origin").remove("token").remove("disabled").remove("pending").commit()
  }

  /** Куда вести, когда откроется приложение: принятый звонок или нажатое уведомление. */
  fun savePending(context: Context, kind: String, checkId: String?, spaceId: String?, notificationId: String?) {
    val json = JSONObject()
      .put("kind", kind)
      .put("checkId", checkId ?: "")
      .put("spaceId", spaceId ?: "")
      .put("notificationId", notificationId ?: "")
      .put("at", System.currentTimeMillis())
    prefs(context).edit().putString("pending", json.toString()).commit()
  }

  fun consumePending(context: Context): Map<String, Any?>? {
    val p = prefs(context)
    val raw = p.getString("pending", null) ?: return null
    p.edit().remove("pending").commit()
    return try {
      val json = JSONObject(raw)
      if (System.currentTimeMillis() - json.optLong("at") > PENDING_TTL_MS) return null
      mapOf(
        "kind" to json.optString("kind"),
        "checkId" to json.optString("checkId"),
        "spaceId" to json.optString("spaceId"),
        "notificationId" to json.optString("notificationId"),
      )
    } catch (_: Exception) {
      null
    }
  }

  /** true — в первый раз (системные просьбы о разрешениях показываем однажды). */
  fun firstTime(context: Context, key: String): Boolean {
    val p = prefs(context)
    if (p.getBoolean("asked_$key", false)) return false
    p.edit().putBoolean("asked_$key", true).commit()
    return true
  }
}
