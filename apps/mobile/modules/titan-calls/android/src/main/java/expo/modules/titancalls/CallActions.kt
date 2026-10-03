package expo.modules.titancalls

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Что делает телефон, когда сотрудник ответил на «звонок» или нажал на уведомление. */
object CallActions {
  /** Модуль JS жив — передаём переход сразу (иначе его заберут при запуске, consumePendingCall). */
  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

  fun answer(context: Context, call: StaffCall) {
    StaffNotifier.endCall(context, call.callId)
    acknowledge(call)
    open(context, call.kind, call.checkId, call.spaceId, null)
  }

  fun open(context: Context, kind: String, checkId: String?, spaceId: String?, notificationId: String?) {
    StaffPrefs.savePending(context, kind, checkId, spaceId, notificationId)
    listener?.let { deliver ->
      StaffPrefs.consumePending(context)?.let(deliver)
    }
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    context.startActivity(launch)
  }

  /** «Ответил» — серверу: вызов прочитан, у остальных звонок гаснет. По одноразовому ключу из события. */
  private fun acknowledge(call: StaffCall) {
    val url = call.ackUrl ?: return
    val key = call.ackKey ?: return
    Thread {
      try {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 15_000
        connection.readTimeout = 15_000
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        val body = JSONObject().put("key", key).put("device", Build.MODEL ?: "Android").toString()
        connection.outputStream.use { it.write(body.toByteArray()) }
        connection.responseCode
        connection.disconnect()
      } catch (_: Exception) {
      }
    }.start()
  }
}

/** Без интерфейса: «Ответить» на уведомлении-звонке и нажатие на обычное уведомление. */
class CallActionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    when (intent?.action) {
      ACTION_ANSWER -> CallActions.answer(this, StaffCall.fromIntent(intent))
      ACTION_OPEN -> CallActions.open(
        this,
        intent.getStringExtra("kind") ?: "",
        intent.getStringExtra("checkId"),
        intent.getStringExtra("spaceId"),
        intent.getStringExtra("notificationId"),
      )
    }
    finish()
  }

  companion object {
    const val ACTION_ANSWER = "ru.titanpos.hub.call.ANSWER"
    const val ACTION_OPEN = "ru.titanpos.hub.call.OPEN"
  }
}
