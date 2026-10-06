package ru.titan.menu

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Включили приставку или обновили приложение — сразу открываем меню (если адрес клуба уже задан). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in STARTS || Prefs(context).menuUrl == null) return
        val launch = Intent(context, MenuActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        // Без разрешения «Поверх других приложений» Android 10+ молча не откроет экран — это не сбой.
        runCatching { context.startActivity(launch) }.onFailure { Log.w(TAG, "Автозапуск не разрешён", it) }
    }

    private companion object {
        const val TAG = "TitanMenu"
        val STARTS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED,
        )
    }
}
