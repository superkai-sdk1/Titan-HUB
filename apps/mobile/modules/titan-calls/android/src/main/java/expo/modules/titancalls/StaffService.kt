package expo.modules.titancalls

import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Постоянная связь телефона сотрудника с клубом: держит поток уведомлений, пока
 * сотрудник вошёл в Titan HUB, — и когда приложение закрыто или телефон заблокирован.
 * Перезапускается системой (START_STICKY) и после перезагрузки (StaffBootReceiver).
 */
class StaffService : Service() {
  private var network: ConnectivityManager.NetworkCallback? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    StaffNotifier.createChannels(this)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
      } else {
        startForeground(NOTIFICATION_ID, buildNotification())
      }
    } catch (_: Exception) {
      // Система не дала стать foreground — поток держим, пока жив процесс.
    }
    watchNetwork()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val cfg = StaffPrefs.load(this)
    if (cfg == null) {
      StaffStream.stop()
      stopSelf()
      return START_NOT_STICKY
    }
    StaffStream.start(applicationContext, cfg)
    return START_STICKY
  }

  override fun onDestroy() {
    network?.let {
      try {
        getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it)
      } catch (_: Exception) {
      }
    }
    network = null
    super.onDestroy()
  }

  private fun watchNetwork() {
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(net: Network) = StaffStream.kick()
    }
    try {
      getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(callback)
      network = callback
    } catch (_: Exception) {
    }
  }

  private fun buildNotification() = NotificationCompat.Builder(this, StaffNotifier.SERVICE_CHANNEL)
    .setSmallIcon(R.drawable.titan_staff_notification)
    .setContentTitle("Titan HUB на связи")
    .setContentText("Сообщения и вызовы из кабинок придут, даже когда приложение закрыто")
    .setOngoing(true)
    .setSilent(true)
    .setPriority(NotificationCompat.PRIORITY_MIN)
    .setCategory(NotificationCompat.CATEGORY_SERVICE)
    .setContentIntent(openApp())
    .build()

  private fun openApp(): PendingIntent? {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  companion object {
    private const val NOTIFICATION_ID = 4711

    fun start(context: Context) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, StaffService::class.java))
      } catch (_: Exception) {
        // Android 12+: из фона службу не поднять — поднимется при следующем открытии приложения.
      }
    }

    fun stop(context: Context) {
      StaffStream.stop()
      context.stopService(Intent(context, StaffService::class.java))
    }
  }
}

/** После перезагрузки и обновления приложения — снова на связи, если сотрудник не выходил. */
class StaffBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (StaffPrefs.load(context) != null) StaffService.start(context)
  }
}

/** «Отклонить» на уведомлении-звонке: гасим у себя, остальные телефоны продолжают звонить. */
class CallDeclineReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    StaffNotifier.endCall(context, intent.getStringExtra("callId") ?: return)
  }
}
