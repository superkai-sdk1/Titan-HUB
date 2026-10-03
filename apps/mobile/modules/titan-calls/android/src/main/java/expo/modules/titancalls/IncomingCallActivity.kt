package expo.modules.titancalls

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference

/**
 * Экран входящего «звонка» из кабинки — поверх блокировки, как у мессенджеров:
 * кто зовёт и что написал, «Отклонить» и «Ответить». Разговора нет: «Ответить»
 * подтверждает вызов на сервере (у остальных звонок гаснет) и открывает чат.
 */
class IncomingCallActivity : Activity() {
  private val main = Handler(Looper.getMainLooper())
  private var call: StaffCall? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    show(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    show(intent)
  }

  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  private fun show(intent: Intent) {
    val next = StaffCall.fromIntent(intent)
    if (next.callId.isBlank()) {
      finish()
      return
    }
    call = next
    current = WeakReference(this)
    setContentView(layout(next))
    main.removeCallbacksAndMessages(null)
    main.postDelayed({ finish() }, StaffNotifier.CALL_TIMEOUT_MS)
  }

  private fun answer() {
    val c = call ?: return
    val keyguard = getSystemService(KeyguardManager::class.java)
    // На заблокированном телефоне сначала разблокировка, затем — приложение на нужном чате.
    if (keyguard != null && keyguard.isKeyguardLocked && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() {
          CallActions.answer(this@IncomingCallActivity, c)
          finish()
        }
      })
      return
    }
    CallActions.answer(this, c)
    finish()
  }

  private fun decline() {
    call?.let { StaffNotifier.endCall(this, it.callId) }
    finish()
  }

  private fun dp(value: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics).toInt()

  private fun layout(c: StaffCall): View {
    val root = FrameLayout(this).apply {
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(Color.parseColor("#2E1065"), Color.parseColor("#120726"), Color.parseColor("#05010D")),
      )
    }

    val head = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(28f), dp(96f), dp(28f), 0)
    }
    head.addView(
      TextView(this).apply {
        text = if (c.kind == "chat") "Сообщение из кабинки" else "Вызов персонала"
        setTextColor(Color.argb(170, 255, 255, 255))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        gravity = Gravity.CENTER
      },
    )
    head.addView(
      TextView(this).apply {
        text = c.caller
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 38f)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        gravity = Gravity.CENTER
        setPadding(0, dp(10f), 0, 0)
      },
    )
    if (c.subtitle.isNotBlank()) {
      head.addView(
        TextView(this).apply {
          text = c.subtitle
          setTextColor(Color.argb(215, 255, 255, 255))
          setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
          gravity = Gravity.CENTER
          maxLines = 4
          setPadding(0, dp(14f), 0, 0)
        },
      )
    }
    head.addView(
      TextView(this).apply {
        text = "Titan HUB"
        setTextColor(Color.argb(110, 255, 255, 255))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        gravity = Gravity.CENTER
        setPadding(0, dp(22f), 0, 0)
      },
    )
    root.addView(head, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP))

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(dp(40f), 0, dp(40f), dp(88f))
    }
    buttons.addView(roundButton("Отклонить", Color.parseColor("#EF4444"), 135f) { decline() }, weighted())
    buttons.addView(roundButton("Ответить", Color.parseColor("#22C55E"), 0f) { answer() }, weighted())
    root.addView(buttons, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    return root
  }

  private fun weighted() = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)

  private fun roundButton(label: String, color: Int, rotation: Float, onTap: () -> Unit): View {
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    val size = dp(76f)
    val icon = ImageView(this).apply {
      setImageResource(R.drawable.titan_staff_call)
      this.rotation = rotation
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      setPadding(dp(20f), dp(20f), dp(20f), dp(20f))
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
      }
      contentDescription = label
      isClickable = true
      setOnClickListener { onTap() }
    }
    column.addView(icon, LinearLayout.LayoutParams(size, size))
    column.addView(
      TextView(this).apply {
        text = label
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        gravity = Gravity.CENTER
        setPadding(0, dp(10f), 0, 0)
      },
    )
    return column
  }

  companion object {
    @Volatile private var current: WeakReference<IncomingCallActivity>? = null

    /** Звонок погас на сервере (ответил другой, прочитали чат) — закрываем экран. */
    fun finishCall(callId: String) {
      val activity = current?.get() ?: return
      activity.runOnUiThread {
        if (activity.call?.callId == callId) activity.finish()
      }
    }
  }
}
