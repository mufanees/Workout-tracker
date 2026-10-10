package my.novas.gloop

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * The phone itself: keep the screen on, the permission picture for Settings → Phone, and the system
 * pages to fix each one.
 */
@CapacitorPlugin(
    name = "Phone",
    permissions = [
        Permission(alias = "bluetooth", strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]),
        Permission(alias = "location", strings = [Manifest.permission.ACCESS_FINE_LOCATION]),
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class PhonePlugin : Plugin() {
    private var awake = false

    /** keepAwake({ on }): FLAG_KEEP_SCREEN_ON on Gloop's window (only while Gloop is on screen, by design). */
    @PluginMethod
    fun keepAwake(call: PluginCall) {
        val on = call.getBoolean("on", true) ?: true
        awake = on
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        call.resolve()
    }

    private fun state(alias: String): String =
        when (getPermissionState(alias)) {
            PermissionState.GRANTED -> "granted"
            PermissionState.DENIED -> "denied"
            else -> "prompt"
        }

    /** status() → { bluetooth, notifications, exactAlarms, batteryUnrestricted, bluetoothOn, sdk, model } */
    @PluginMethod
    fun status(call: PluginCall) {
        val nm = context.getSystemService(NotificationManager::class.java)
        val pm = context.getSystemService(PowerManager::class.java)
        val bt = context.getSystemService(android.bluetooth.BluetoothManager::class.java)?.adapter
        val notif =
            when {
                nm?.areNotificationsEnabled() == true -> "granted"
                Build.VERSION.SDK_INT >= 33 -> state("notifications")
                else -> "denied"
            }
        call.resolve(
            JSObject()
                .put("bluetooth", state(if (Build.VERSION.SDK_INT >= 31) "bluetooth" else "location"))
                .put("bluetoothOn", bt?.isEnabled == true)
                .put("notifications", notif)
                .put("exactAlarms", Timers.canExact(context))
                .put("batteryUnrestricted", pm?.isIgnoringBatteryOptimizations(context.packageName) == true)
                .put("sdk", Build.VERSION.SDK_INT)
                .put("model", Build.MODEL ?: ""),
        )
    }

    /** request({ what: 'bluetooth' | 'notifications' }) → the system prompt, then status(). */
    @PluginMethod
    fun request(call: PluginCall) {
        val alias =
            when (call.getString("what")) {
                "bluetooth" -> if (Build.VERSION.SDK_INT >= 31) "bluetooth" else "location"
                "notifications" -> if (Build.VERSION.SDK_INT >= 33) "notifications" else null
                else -> null
            }
        if (alias == null || getPermissionState(alias) == PermissionState.GRANTED) return status(call)
        requestPermissionForAlias(alias, call, "afterRequest")
    }

    @PermissionCallback
    private fun afterRequest(call: PluginCall) {
        status(call)
    }

    /**
     * open({ what: 'battery' | 'notifications' | 'exactAlarms' | 'bluetooth' | 'app' }).
     * 'battery' asks to run unrestricted in the background (the system dialog), so heart rate keeps
     * recording with the screen off for long sessions.
     */
    @PluginMethod
    fun open(call: PluginCall) {
        val pkg = context.packageName
        val intent =
            when (call.getString("what")) {
                "battery" -> {
                    val pm = context.getSystemService(PowerManager::class.java)
                    if (pm?.isIgnoringBatteryOptimizations(pkg) == true) {
                        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    } else {
                        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg"))
                    }
                }
                "notifications" -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                "exactAlarms" ->
                    if (Build.VERSION.SDK_INT >= 31) {
                        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg"))
                    } else {
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
                    }
                "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
                else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
            }
        try {
            activity.startActivity(intent)
        } catch (e: Exception) {
            try {
                activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")))
            } catch (e2: Exception) {
                return call.reject("Couldn’t open settings")
            }
        }
        call.resolve()
    }

    override fun handleOnResume() {
        // the flag lives on the window; put it back if something cleared it
        if (awake) activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
}
