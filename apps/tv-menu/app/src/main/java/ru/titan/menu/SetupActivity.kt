package ru.titan.menu

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast

/** Настройки с пульта: адрес клуба, как висит телевизор, автозапуск. */
class SetupActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var address: EditText
    private lateinit var rotations: RadioGroup
    private lateinit var autostart: TextView
    private lateinit var autostartButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        prefs = Prefs(this)
        address = findViewById(R.id.address)
        rotations = findViewById(R.id.rotation)
        autostart = findViewById(R.id.autostart_status)
        autostartButton = findViewById(R.id.autostart_button)
        findViewById<TextView>(R.id.version).text = getString(R.string.setup_version, BuildConfig.VERSION_NAME)

        address.setText(prefs.address.ifBlank { Prefs.DEFAULT_ADDRESS })
        rotations.check(rotationButton(prefs.rotation))
        address.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) start()
            actionId == EditorInfo.IME_ACTION_DONE
        }
        val startButton = findViewById<Button>(R.id.start)
        startButton.setOnClickListener { start() }
        autostartButton.setOnClickListener { requestAutostart() }
        findViewById<Button>(R.id.home_button).setOnClickListener { openSettings(Settings.ACTION_HOME_SETTINGS) }
        findViewById<Button>(R.id.system_settings).setOnClickListener { openSettings(Settings.ACTION_SETTINGS) }
        findViewById<Button>(R.id.exit).setOnClickListener { finishAffinity() }
        startButton.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        showAutostart()
    }

    private fun start() {
        val raw = address.text.toString().trim()
        if (Prefs.menuUrl(raw) == null) {
            address.error = getString(R.string.setup_address_error)
            address.requestFocus()
            return
        }
        prefs.address = raw
        prefs.rotation = rotationOf(rotations.checkedRadioButtonId)
        startActivity(Intent(this, MenuActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        finish()
    }

    // С Android 10 приложение может открыть экран после загрузки только с разрешением «Поверх других приложений».
    private fun autostartAllowed() = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(this)

    private fun showAutostart() {
        val allowed = autostartAllowed()
        autostart.setText(if (allowed) R.string.setup_autostart_on else R.string.setup_autostart_off)
        autostartButton.visibility = if (allowed) View.GONE else View.VISIBLE
    }

    private fun requestAutostart() {
        val opened = tryStart(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) ||
            tryStart(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION))
        if (!opened) autostart.text = getString(R.string.setup_autostart_adb, packageName)
    }

    private fun openSettings(action: String) {
        if (!tryStart(Intent(action))) Toast.makeText(this, R.string.setup_no_screen, Toast.LENGTH_LONG).show()
    }

    private fun tryStart(intent: Intent): Boolean = try {
        startActivity(intent)
        true
    } catch (e: ActivityNotFoundException) {
        false
    }

    private fun rotationButton(rotation: Int) = when (rotation) {
        0 -> R.id.rotate_0
        270 -> R.id.rotate_270
        else -> R.id.rotate_90
    }

    private fun rotationOf(buttonId: Int) = when (buttonId) {
        R.id.rotate_0 -> 0
        R.id.rotate_270 -> 270
        else -> 90
    }
}
