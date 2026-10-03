package expo.modules.titancalls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import org.json.JSONObject

/** Данные «звонка» из события staff:call (то же, что в VoIP-push на iPhone). */
data class StaffCall(
  val callId: String,
  val kind: String,
  val caller: String,
  val subtitle: String,
  val checkId: String?,
  val spaceId: String?,
  val ackUrl: String?,
  val ackKey: String?,
) {
  fun toIntent(intent: Intent): Intent = intent
    .putExtra("callId", callId)
    .putExtra("kind", kind)
    .putExtra("caller", caller)
    .putExtra("subtitle", subtitle)
    .putExtra("checkId", checkId)
    .putExtra("spaceId", spaceId)
    .putExtra("ackUrl", ackUrl)
    .putExtra("ackKey", ackKey)

  companion object {
    fun fromJson(json: JSONObject) = StaffCall(
      callId = json.optString("callId"),
      kind = json.optString("kind"),
      caller = json.optString("caller").ifBlank { "Titan HUB" },
      subtitle = json.optString("subtitle"),
      checkId = json.optString("checkId").takeIf { it.isNotBlank() && it != "null" },
      spaceId = json.optString("spaceId").takeIf { it.isNotBlank() && it != "null" },
      ackUrl = json.optString("ackUrl").takeIf { it.isNotBlank() },
      ackKey = json.optString("ackKey").takeIf { it.isNotBlank() },
    )

    fun fromIntent(intent: Intent) = StaffCall(
      callId = intent.getStringExtra("callId") ?: "",
      kind = intent.getStringExtra("kind") ?: "",
      caller = intent.getStringExtra("caller") ?: "Titan HUB",
      subtitle = intent.getStringExtra("subtitle") ?: "",
      checkId = intent.getStringExtra("checkId"),
      spaceId = intent.getStringExtra("spaceId"),
      ackUrl = intent.getStringExtra("ackUrl"),
      ackKey = intent.getStringExtra("ackKey"),
    )
  }
}

/**
 * Системные уведомления персонала: обычные (сообщение из кабинки, вызов, заказ) и
 * «входящий звонок» — CallStyle с «Ответить» / «Отклонить», на весь экран поверх
 * блокировки и с мелодией звонка, пока не ответят, не отклонят или не погаснет сам.
 */
object StaffNotifier {
  const val SERVICE_CHANNEL = "titan_staff_service"
  private const val ALERTS_CHANNEL = "titan_staff_alerts"
  private const val CALLS_CHANNEL = "titan_staff_calls"
  private const val CALL_TAG = "titan-call"
  private const val ALERT_TAG = "titan-alert"
  /** Никто не ответил за 45 с — звонок гаснет, как пропущенный (так же на iPhone). */
  const val CALL_TIMEOUT_MS = 45_000L
  private val ACCENT = Color.parseColor("#7C3AED")

  fun createChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(NotificationManager::class.java) ?: return
    nm.createNotificationChannel(
      NotificationChannel(SERVICE_CHANNEL, "Связь с клубом", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Постоянное подключение для уведомлений и звонков из кабинок"
        setShowBadge(false)
      },
    )
    nm.createNotificationChannel(
      NotificationChannel(ALERTS_CHANNEL, "Уведомления персонала", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Сообщения из кабинок, вызовы персонала, заказы"
        enableVibration(true)
        lightColor = ACCENT
      },
    )
    nm.createNotificationChannel(
      NotificationChannel(CALLS_CHANNEL, "Звонки из кабинок", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Гостю никто не ответил 30 секунд — телефон звонит"
        val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        setSound(
          ringtone,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 900, 600, 900, 600)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      },
    )
  }

  private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  /** Обычное уведомление: нажатие открывает чат или счёт кабинки. */
  fun showAlert(context: Context, json: JSONObject) {
    createChannels(context)
    val type = json.optString("type")
    val meta = json.optJSONObject("meta")
    val checkId = meta?.optString("checkId")?.takeIf { it.isNotBlank() }
    val spaceId = meta?.optString("spaceId")?.takeIf { it.isNotBlank() }
    val notificationId = json.optString("id").takeIf { it.isNotBlank() }
    val kind = if (type == "chat_message") "chat" else type
    val open = Intent(context, CallActionActivity::class.java)
      .setAction(CallActionActivity.ACTION_OPEN)
      .putExtra("kind", kind)
      .putExtra("checkId", checkId)
      .putExtra("spaceId", spaceId)
      .putExtra("notificationId", notificationId)
    // Одно уведомление на кабинку и тип: новые сообщения обновляют его, а не копятся.
    val key = "$type:${checkId ?: spaceId ?: notificationId}"
    val notification = NotificationCompat.Builder(context, ALERTS_CHANNEL)
      .setSmallIcon(R.drawable.titan_staff_notification)
      .setColor(ACCENT)
      .setContentTitle(json.optString("title").ifBlank { "Titan HUB" })
      .setContentText(json.optString("body"))
      .setStyle(NotificationCompat.BigTextStyle().bigText(json.optString("body")))
      .setCategory(if (type == "chat_message") NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_EVENT)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(PendingIntent.getActivity(context, key.hashCode(), open, flags()))
      .build()
    notify(context, ALERT_TAG, key.hashCode(), notification)
  }

  fun showCall(context: Context, json: JSONObject) {
    val call = StaffCall.fromJson(json)
    if (call.callId.isBlank()) return
    createChannels(context)
    val id = call.callId.hashCode()
    val fullScreen = PendingIntent.getActivity(
      context, id,
      call.toIntent(Intent(context, IncomingCallActivity::class.java)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      flags(),
    )
    val answer = PendingIntent.getActivity(
      context, id + 1,
      call.toIntent(Intent(context, CallActionActivity::class.java).setAction(CallActionActivity.ACTION_ANSWER)),
      flags(),
    )
    val decline = PendingIntent.getBroadcast(
      context, id + 2,
      Intent(context, CallDeclineReceiver::class.java).putExtra("callId", call.callId),
      flags(),
    )
    val person = Person.Builder().setName(call.caller).setImportant(true).build()
    val base = NotificationCompat.Builder(context, CALLS_CHANNEL)
      .setSmallIcon(R.drawable.titan_staff_notification)
      .setColor(ACCENT)
      .setContentTitle(call.caller)
      .setContentText(call.subtitle)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setTimeoutAfter(CALL_TIMEOUT_MS)
      .setContentIntent(fullScreen)
      .setFullScreenIntent(fullScreen, true)
    val notification = try {
      base.setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer)).build()
    } catch (e: Exception) {
      Log.w("TitanCalls", "CallStyle недоступен: ${e.message}")
      base.addAction(0, "Отклонить", decline).addAction(0, "Ответить", answer).build()
    }
    // Мелодия повторяется, пока звонок не погаснет.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    notify(context, CALL_TAG, id, notification)
  }

  /** Звонок погас: ответил кто-то другой, прочитали чат, истёк или отклонили. */
  fun endCall(context: Context, callId: String) {
    if (callId.isBlank()) return
    try {
      context.getSystemService(NotificationManager::class.java)?.cancel(CALL_TAG, callId.hashCode())
    } catch (_: Exception) {
    }
    IncomingCallActivity.finishCall(callId)
  }

  private fun notify(context: Context, tag: String, id: Int, notification: Notification) {
    try {
      context.getSystemService(NotificationManager::class.java)?.notify(tag, id, notification)
    } catch (e: SecurityException) {
      // Нет разрешения на уведомления — приложение попросит его при входе.
      Log.w("TitanCalls", "уведомление не показано: ${e.message}")
    }
  }
}
