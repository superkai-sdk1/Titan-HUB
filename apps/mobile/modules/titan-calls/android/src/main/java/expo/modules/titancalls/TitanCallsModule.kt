package expo.modules.titancalls

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Мост JS ↔ уведомления и «звонки» персоналу на Android: запуск постоянной связи
 * с клубом после входа, остановка при выходе, переход по принятому звонку.
 * Интерфейс общий с iOS (TitanCallsModule.swift): getVoipToken, consumePendingCall,
 * событие onCallAnswered.
 */
class TitanCallsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TitanCalls")

    Events("onVoipToken", "onCallAnswered")

    OnCreate {
      CallActions.listener = { data -> sendEvent("onCallAnswered", data) }
    }

    OnDestroy {
      CallActions.listener = null
    }

    /** VoIP есть только на iPhone. */
    Function("getVoipToken") { null as String? }

    /** Звонок или уведомление, нажатые до запуска JS: {kind, checkId, spaceId, notificationId} или null. */
    Function("consumePendingCall") { StaffPrefs.consumePending(context) }

    /** Сотрудник вошёл: держать связь с клубом. disabled — выключенные им типы уведомлений. */
    Function("start") { origin: String, token: String, disabled: List<String> ->
      StaffPrefs.save(context, StaffConfig(origin.trimEnd('/'), token, disabled.toSet()))
      StaffService.start(context)
    }

    /** Выход: связь и уведомления на этом телефоне прекращаются. */
    Function("stop") {
      StaffPrefs.clear(context)
      StaffService.stop(context)
    }

    /** Состояние связи: idle | connecting | connected | offline | unauthorized. */
    Function("getStatus") { StaffStream.status }

    /** Android 14+: звонок на весь экран требует разрешения пользователя. */
    Function("canUseFullScreenIntent") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        true
      } else {
        context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: true
      }
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startSettings(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}")))
      }
    }

    /** Без режима экономии энергии система может разрывать связь в простое. */
    Function("isIgnoringBatteryOptimizations") {
      (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isIgnoringBatteryOptimizations(context.packageName) ?: true
    }

    Function("requestIgnoreBatteryOptimizations") {
      startSettings(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")))
    }

    /** true — впервые (просьбы о разрешениях показываем один раз). */
    Function("firstTime") { key: String -> StaffPrefs.firstTime(context, key) }
  }

  private fun startSettings(intent: Intent) {
    try {
      val activity = appContext.currentActivity
      if (activity != null) activity.startActivity(intent) else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
    }
  }
}
