package ru.titan.menu

import android.annotation.SuppressLint
import android.annotation.TargetApi
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView

/**
 * Меню клуба на весь экран телевизора. «Назад» меню не закрывает; пропала связь или сервер
 * перезапускается — показываем, что происходит, и повторяем сами. Настройки — удержать OK
 * на пульте или нажать «Меню».
 */
class MenuActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var stage: FrameLayout
    private lateinit var status: View
    private lateinit var statusText: TextView
    private lateinit var hint: View
    private var web: WebView? = null
    private var url = ""
    private var host = ""
    private var failed = false
    private var retryDelay = RETRY_MIN_MS
    private var holdHandled = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val retry = Runnable { load() }
    private val stuck = Runnable { fail(getString(R.string.status_slow)) }
    private val hideHint = Runnable { hint.animate().alpha(0f).setDuration(HINT_FADE_MS).start() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = Prefs(this)
        val target = prefs.menuUrl
        if (target == null) {
            openSetup()
            finish()
            return
        }
        url = target
        host = Uri.parse(target).host.orEmpty()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Страницу можно отладить через chrome://inspect, подключив приставку по adb.
        WebView.setWebContentsDebuggingEnabled(true)
        setContentView(buildScreen(prefs.rotation))
        hideSystemBars()
        createWebView()
        watchNetwork()
        load()
        showHint()
    }

    private fun buildScreen(rotation: Int): View {
        stage = FrameLayout(this).apply { setBackgroundColor(getColor(R.color.bg)) }
        status = layoutInflater.inflate(R.layout.view_status, stage, false)
        statusText = status.findViewById(R.id.status_text)
        status.findViewById<TextView>(R.id.status_host).text = host
        hint = layoutInflater.inflate(R.layout.view_hint, stage, false)
        stage.addView(status)
        stage.addView(hint)
        return RotatedLayout(this).apply {
            setBackgroundColor(getColor(R.color.bg))
            angle = rotation
            addView(stage)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() {
        val view = WebView(this).apply {
            setBackgroundColor(getColor(R.color.bg))
            isFocusable = false
            isFocusableInTouchMode = false
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            settings.javaScriptEnabled = true // страница меню собирается скриптом
            settings.domStorageEnabled = true // она помнит тему и время прошлой загрузки
            settings.mediaPlaybackRequiresUserGesture = false
            settings.textZoom = 100 // крупный шрифт в системе ломает раскладку меню
            settings.setSupportZoom(false)
            settings.userAgentString = "${settings.userAgentString} TitanMenu/${BuildConfig.VERSION_NAME}"
            webViewClient = MenuClient()
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    Log.d(TAG, "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                    return true
                }
            }
        }
        stage.addView(view, 0, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        web = view
    }

    private fun load() {
        handler.removeCallbacks(retry)
        if (status.visibility == View.VISIBLE && failed) statusText.text = getString(R.string.status_connecting)
        web?.loadUrl(url)
    }

    private fun fail(reason: String) {
        failed = true
        handler.removeCallbacks(stuck)
        handler.removeCallbacks(retry)
        statusText.text = getString(R.string.status_retry, reason, retryDelay / 1000)
        status.visibility = View.VISIBLE
        handler.postDelayed(retry, retryDelay)
        retryDelay = (retryDelay * 2).coerceAtMost(RETRY_MAX_MS)
    }

    private fun shown() {
        if (failed) return
        handler.removeCallbacks(stuck)
        retryDelay = RETRY_MIN_MS
        status.visibility = View.GONE
    }

    private fun describe(code: Int): String = when {
        !online() -> getString(R.string.status_offline)
        code == WebViewClient.ERROR_HOST_LOOKUP -> getString(R.string.status_dns, host)
        code == WebViewClient.ERROR_CONNECT || code == WebViewClient.ERROR_TIMEOUT -> getString(R.string.status_timeout)
        code == WebViewClient.ERROR_FAILED_SSL_HANDSHAKE -> getString(R.string.status_ssl)
        else -> getString(R.string.status_error, code)
    }

    private fun online(): Boolean = getSystemService(ConnectivityManager::class.java)?.activeNetwork != null

    private inner class MenuClient : WebViewClient() {
        // Уходить со страницы меню некуда: чужие адреса не открываем.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.url.host != host

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            failed = false
            handler.removeCallbacks(stuck)
            handler.postDelayed(stuck, LOAD_TIMEOUT_MS)
        }

        override fun onPageCommitVisible(view: WebView, url: String?) = shown()

        override fun onPageFinished(view: WebView, url: String?) = shown()

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) fail(describe(error.errorCode))
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
            if (!request.isForMainFrame) return
            val code = response.statusCode
            fail(if (code == 404) getString(R.string.status_not_found) else getString(R.string.status_http, code))
        }

        override fun onReceivedSslError(view: WebView, ssl: SslErrorHandler, error: SslError) {
            ssl.cancel()
            if (Uri.parse(error.url).host == host) fail(getString(R.string.status_ssl))
        }

        @TargetApi(Build.VERSION_CODES.O)
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.w(TAG, "Процесс страницы завершился (сбой: ${detail.didCrash()}), открываем заново")
            restartWebView()
            return true
        }
    }

    private fun restartWebView() {
        web?.let {
            stage.removeView(it)
            it.destroy()
        }
        web = null
        createWebView()
        load()
    }

    private fun watchNetwork() {
        val connectivity = getSystemService(ConnectivityManager::class.java) ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handler.post {
                    if (failed) {
                        retryDelay = RETRY_MIN_MS
                        load()
                    }
                }
            }
        }
        runCatching { connectivity.registerDefaultNetworkCallback(callback) }
            .onSuccess { networkCallback = callback }
            .onFailure { Log.w(TAG, "Не удалось следить за сетью", it) }
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            in PASS_THROUGH -> return super.dispatchKeyEvent(event)
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SETTINGS -> if (event.action == KeyEvent.ACTION_UP) openSetup()
            in OK_KEYS -> onOk(event)
            else -> if (event.action == KeyEvent.ACTION_UP) showHint()
        }
        return true
    }

    /** Удержание OK — настройки. Одни пульты при удержании шлют повторы, другие — только «отпущено». */
    private fun onOk(event: KeyEvent) {
        val held = event.eventTime - event.downTime >= HOLD_MS
        when (event.action) {
            KeyEvent.ACTION_DOWN -> {
                if (event.repeatCount == 0) holdHandled = false
                if (held && !holdHandled) {
                    holdHandled = true
                    openSetup()
                }
            }
            KeyEvent.ACTION_UP -> when {
                holdHandled -> Unit
                held -> openSetup()
                else -> showHint()
            }
        }
    }

    private fun showHint() {
        handler.removeCallbacks(hideHint)
        hint.animate().cancel()
        hint.alpha = 1f
        handler.postDelayed(hideHint, HINT_MS)
    }

    private fun openSetup() = startActivity(Intent(this, SetupActivity::class.java))

    override fun onResume() {
        super.onResume()
        web?.onResume()
    }

    override fun onPause() {
        web?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        networkCallback?.let { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) }
        web?.destroy()
        web = null
        super.onDestroy()
    }

    private companion object {
        const val TAG = "TitanMenu"
        const val RETRY_MIN_MS = 5_000L
        const val RETRY_MAX_MS = 60_000L
        const val LOAD_TIMEOUT_MS = 45_000L
        const val HOLD_MS = 1_200L
        const val HINT_MS = 6_000L
        const val HINT_FADE_MS = 400L
        val OK_KEYS = setOf(KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER)
        val PASS_THROUGH = setOf(
            KeyEvent.KEYCODE_VOLUME_UP,
            KeyEvent.KEYCODE_VOLUME_DOWN,
            KeyEvent.KEYCODE_VOLUME_MUTE,
            KeyEvent.KEYCODE_POWER,
            KeyEvent.KEYCODE_SLEEP,
            KeyEvent.KEYCODE_WAKEUP,
        )
    }
}
