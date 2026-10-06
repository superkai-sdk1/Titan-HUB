package ru.titan.menu

import android.content.Context
import android.net.Uri

/** Настройки экрана: адрес меню клуба и поворот картинки под вертикальный телевизор. */
class Prefs(context: Context) {
    private val store = context.getSharedPreferences("titan_menu", Context.MODE_PRIVATE)

    var address: String
        get() = store.getString(KEY_ADDRESS, null).orEmpty()
        set(value) = store.edit().putString(KEY_ADDRESS, value).apply()

    var rotation: Int
        get() = store.getInt(KEY_ROTATION, DEFAULT_ROTATION).takeIf { it in ROTATIONS } ?: DEFAULT_ROTATION
        set(value) = store.edit().putInt(KEY_ROTATION, value).apply()

    val menuUrl: String? get() = menuUrl(address)

    companion object {
        const val DEFAULT_ADDRESS = "kbr.titanpos.ru"
        const val DEFAULT_ROTATION = 90
        val ROTATIONS = setOf(0, 90, 270)

        private const val KEY_ADDRESS = "address"
        private const val KEY_ROTATION = "rotation"
        private val SCHEME = Regex("^https?://", RegexOption.IGNORE_CASE)

        /**
         * «kbr.titanpos.ru» → https://kbr.titanpos.ru/menu. Адрес со схемой берётся как есть
         * (так можно указать ?theme= или локальный сервер для проверки); без пути — дописываем /menu.
         */
        fun menuUrl(address: String): String? {
            val raw = address.trim()
            if (raw.isEmpty() || raw.any { it.isWhitespace() }) return null
            val uri = Uri.parse(if (SCHEME.containsMatchIn(raw)) raw else "https://$raw")
            val host = uri.host
            if (host.isNullOrBlank() || (!host.contains('.') && host != "localhost")) return null
            val path = uri.path
            return if (path.isNullOrEmpty() || path == "/") uri.buildUpon().path("/menu").build().toString() else uri.toString()
        }
    }
}
