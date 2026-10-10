package my.novas.gloop

import android.content.Intent
import android.graphics.Color
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Ongoing notifications Gloop keeps in the shade (see [Live]).
 * JS: show/update({ kind: 'hr' | 'fast' | 'timer', title, text, chronometerBase?, countdown?, number?,
 * progress?, color?, goalAt?, doneTitle?, doneText?, hourly?, path? }), clear({ kind }),
 * alert({ title, text, number? }), takeOpened() → { path? }; event 'open' { path } when a
 * notification is tapped.
 */
@CapacitorPlugin(name = "LiveNotification")
class LiveNotificationPlugin : Plugin() {
    override fun load() {
        Live.ensureChannels(context)
        // the activity was launched from a notification before the page could listen
        activity?.intent?.let { take(it) }
    }

    override fun handleOnNewIntent(intent: Intent) {
        take(intent)
    }

    private fun take(intent: Intent) {
        val path = intent.getStringExtra(Live.EXTRA_PATH) ?: return
        intent.removeExtra(Live.EXTRA_PATH)
        Live.pendingPath = path
        notifyListeners("open", JSObject().put("path", path), true)
    }

    private fun spec(call: PluginCall): LiveSpec? {
        val kind = call.getString("kind")
        if (kind != "hr" && kind != "fast" && kind != "timer") return null
        val color =
            call.getString("color")?.let {
                try {
                    Color.parseColor(it)
                } catch (e: IllegalArgumentException) {
                    null
                }
            }
        return LiveSpec(
            kind = kind,
            title = call.getString("title") ?: "Gloop",
            text = call.getString("text") ?: "",
            chronometerBase = call.long("chronometerBase"),
            countdown = call.getBoolean("countdown", false) ?: false,
            number = call.data.opt("number")?.takeIf { it != JSONNull }?.toString(),
            progress = call.double("progress"),
            color = color,
            goalAt = call.long("goalAt"),
            doneTitle = call.getString("doneTitle"),
            doneText = call.getString("doneText"),
            hourly = call.getBoolean("hourly", false) ?: false,
            path = call.getString("path"),
        )
    }

    @PluginMethod
    fun show(call: PluginCall) {
        val s = spec(call) ?: return call.reject("kind must be hr, fast or timer")
        if (s.kind == "hr") HrService.pageSeenAt = System.currentTimeMillis()
        Live.show(context, s)
        call.resolve()
    }

    @PluginMethod
    fun update(call: PluginCall) = show(call)

    @PluginMethod
    fun clear(call: PluginCall) {
        val kind = call.getString("kind") ?: return call.reject("kind is required")
        Live.clear(context, kind)
        call.resolve()
    }

    /** A vibrating one-off (zone alerts). */
    @PluginMethod
    fun alert(call: PluginCall) {
        Live.alert(context, call.getString("title") ?: "Gloop", call.getString("text") ?: "", call.data.opt("number")?.takeIf { it != JSONNull }?.toString())
        call.resolve()
    }

    /** The path of a tapped notification the page hasn't handled yet (then forgotten). */
    @PluginMethod
    fun takeOpened(call: PluginCall) {
        val p = Live.pendingPath
        Live.pendingPath = null
        call.resolve(if (p != null) JSObject().put("path", p) else JSObject())
    }

    private companion object {
        val JSONNull: Any = org.json.JSONObject.NULL
    }
}
