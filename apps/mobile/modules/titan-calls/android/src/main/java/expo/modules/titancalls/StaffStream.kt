package expo.modules.titancalls

import android.app.ActivityManager
import android.content.Context
import android.os.PowerManager
import android.util.Log
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Поток уведомлений персонала клуба (SSE /api/notifications/stream) — замена push
 * без Google-сервисов. Безымянные события — уведомления (как в вебе и на iPhone),
 * `staff:call` / `staff:call-end` — «звонок» из кабинки и его отбой.
 *
 * Сервер пингует раз в 25 с: тишина дольше 70 с — соединение мертво, переподключаемся.
 */
object StaffStream {
  private const val TAG = "TitanCalls"
  private val client = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(70, TimeUnit.SECONDS)
    .retryOnConnectionFailure(true)
    .build()

  @Volatile var status: String = "idle"
    private set

  private val lock = Any()
  private var generation = 0
  private var worker: Thread? = null
  private var call: Call? = null
  private var running: StaffConfig? = null

  fun start(context: Context, cfg: StaffConfig) {
    synchronized(lock) {
      if (running == cfg && worker?.isAlive == true) return
      stopLocked()
      running = cfg
      val gen = ++generation
      val app = context.applicationContext
      worker = Thread({ loop(app, cfg, gen) }, "titan-staff-stream").apply {
        isDaemon = true
        start()
      }
    }
  }

  fun stop() {
    synchronized(lock) { stopLocked() }
  }

  private fun stopLocked() {
    generation++
    running = null
    call?.cancel()
    call = null
    worker?.interrupt()
    worker = null
    status = "idle"
  }

  /** Сеть вернулась — не ждём конца паузы перед переподключением. */
  fun kick() {
    synchronized(lock) {
      if (status != "connected") worker?.interrupt()
    }
  }

  private fun alive(gen: Int) = synchronized(lock) { gen == generation }

  private fun loop(context: Context, cfg: StaffConfig, gen: Int) {
    var pause = 1_000L
    while (alive(gen)) {
      try {
        val request = Request.Builder()
          .url("${cfg.origin}/api/notifications/stream")
          .header("Authorization", "Bearer ${cfg.token}")
          .header("Accept", "text/event-stream")
          .build()
        val current = client.newCall(request)
        synchronized(lock) {
          if (gen != generation) return
          call = current
        }
        status = "connecting"
        current.execute().use { response ->
          if (response.code == 401 || response.code == 403) {
            // Токен больше не действует: ждём, пока приложение не передаст новый.
            status = "unauthorized"
            return
          }
          if (!response.isSuccessful) throw IOException("HTTP ${response.code}")
          status = "connected"
          pause = 1_000L
          val source = response.body?.source() ?: throw IOException("empty body")
          var event: String? = null
          val data = StringBuilder()
          while (alive(gen)) {
            val line = source.readUtf8Line() ?: break
            if (line.isEmpty()) {
              if (data.isNotEmpty()) dispatch(context, cfg, event ?: "message", data.toString())
              event = null
              data.setLength(0)
              continue
            }
            if (line.startsWith(":")) continue
            val colon = line.indexOf(':')
            val field = if (colon < 0) line else line.substring(0, colon)
            var value = if (colon < 0) "" else line.substring(colon + 1)
            if (value.startsWith(" ")) value = value.substring(1)
            when (field) {
              "event" -> event = value
              "data" -> {
                if (data.isNotEmpty()) data.append('\n')
                data.append(value)
              }
            }
          }
        }
      } catch (e: Exception) {
        // Обрыв, тайм-аут или отмена — переподключимся, если ещё нужны.
        if (alive(gen)) Log.i(TAG, "поток прервался: ${e.message}")
      }
      if (!alive(gen)) return
      status = "offline"
      try {
        Thread.sleep(pause)
      } catch (_: InterruptedException) {
        // kick(): сеть вернулась — сразу пробуем снова.
      }
      pause = (pause * 2).coerceAtMost(30_000L)
    }
  }

  private fun dispatch(context: Context, cfg: StaffConfig, event: String, data: String) {
    if (event == "ping") return
    // Пока показываем уведомление, телефон не должен уснуть на полпути.
    val wake = (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)
      ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "titan-hub:staff-event")
    try {
      wake?.acquire(10_000L)
      val json = JSONObject(data)
      when (event) {
        "staff:call" -> {
          val type = if (json.optString("kind") == "chat") "chat_message" else "staff_call"
          if (type !in cfg.disabled) StaffNotifier.showCall(context, json)
        }
        "staff:call-end" -> StaffNotifier.endCall(context, json.optString("callId"))
        "message" -> {
          val type = json.optString("type")
          if (type.isNotEmpty() && type !in cfg.disabled && !appInForeground()) StaffNotifier.showAlert(context, json)
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "событие $event не обработано", e)
    } finally {
      try {
        if (wake?.isHeld == true) wake.release()
      } catch (_: Exception) {
      }
    }
  }

  /** Приложение на экране — уведомление покажет оно само (баннер), системное не нужно. */
  private fun appInForeground(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }
}
