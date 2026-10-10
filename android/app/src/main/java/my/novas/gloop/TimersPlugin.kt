package my.novas.gloop

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Exact alarms for rest / set timers, so the end fires with the screen locked and the page frozen. */
object Timers {
    const val ACTION_TIMER = "my.novas.gloop.TIMER"
    const val EXTRA_ID = "id"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_PATH = "path"
    const val EXTRA_CLEARS_LIVE = "clearsLive"
    private const val PREFS = "gloop-timers"

    fun canExact(ctx: Context): Boolean {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return false
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    }

    private fun pending(ctx: Context, id: String, extras: Intent.() -> Unit = {}): PendingIntent {
        val i =
            Intent(ctx, LiveReceiver::class.java).apply {
                action = ACTION_TIMER
                // one alarm per id: the data URI keeps the PendingIntents apart
                data = Uri.parse("gloop-timer://$id")
                putExtra(EXTRA_ID, id)
                extras()
            }
        return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Returns whether the alarm is exact (false: Android may deliver it a few minutes late). */
    fun schedule(ctx: Context, id: String, at: Long, title: String, text: String, path: String?, clearsLive: Boolean): Boolean {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return false
        val pi =
            pending(ctx, id) {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_TEXT, text)
                putExtra(EXTRA_CLEARS_LIVE, clearsLive)
                if (path != null) putExtra(EXTRA_PATH, path)
            }
        val exact = canExact(ctx)
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi) else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } catch (e: SecurityException) {
            // exact alarms were revoked between the check and the call
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            return remember(ctx, id, at, false)
        }
        return remember(ctx, id, at, exact)
    }

    private fun remember(ctx: Context, id: String, at: Long, exact: Boolean): Boolean {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(id, at).apply()
        return exact
    }

    fun forget(ctx: Context, id: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(id).apply()
    }

    fun cancel(ctx: Context, id: String) {
        ctx.getSystemService(AlarmManager::class.java)?.cancel(pending(ctx, id))
        forget(ctx, id)
    }

    fun pendingAt(ctx: Context, id: String): Long? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return if (p.contains(id)) p.getLong(id, 0) else null
    }
}

@CapacitorPlugin(name = "Timers")
class TimersPlugin : Plugin() {
    /** schedule({ id, at, title, text, path?, clearsLive? }) → { exact } */
    @PluginMethod
    fun schedule(call: PluginCall) {
        val id = call.getString("id")
        val at = call.long("at")
        if (id.isNullOrEmpty() || at == null) return call.reject("id and at are required")
        val exact = Timers.schedule(context, id, at, call.getString("title") ?: "Time’s up", call.getString("text") ?: "", call.getString("path"), call.getBoolean("clearsLive", true) ?: true)
        call.resolve(JSObject().put("exact", exact))
    }

    /** cancel({ id }) */
    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id is required")
        Timers.cancel(context, id)
        call.resolve()
    }

    /** status() → { exact, sdk } */
    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(JSObject().put("exact", Timers.canExact(context)).put("sdk", Build.VERSION.SDK_INT))
    }

    /** Android 12: the "Alarms & reminders" page for this app (13+ grants USE_EXACT_ALARM at install). */
    @PluginMethod
    fun openExactAlarmSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName)))
            } catch (e: Exception) {
                return call.reject("Couldn’t open the settings page")
            }
        }
        call.resolve()
    }
}
