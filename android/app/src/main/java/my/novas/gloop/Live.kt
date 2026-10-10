package my.novas.gloop

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Gloop is in front (the activity is resumed): its own page beeps and shows things, so alarms stay quiet. */
object AppState {
    @Volatile
    var foreground = false
}

/**
 * What one live notification shows. `kind` is 'hr' (heart rate / workout, also the foreground
 * service's notification), 'fast' (the running fast) or 'timer' (rest or set timer counting down).
 */
data class LiveSpec(
    val kind: String,
    val title: String,
    val text: String,
    /** Epoch ms: counts up from here (or down to here with [countdown]) natively, even with the app closed. */
    val chronometerBase: Long? = null,
    val countdown: Boolean = false,
    /** Drawn into the status bar icon (bpm, hours fasted). Null: the static Gloop icon. */
    val number: String? = null,
    /** 0..1, shown as a progress bar. */
    val progress: Double? = null,
    val color: Int? = null,
    /** Fast only: from this time on, show [doneTitle]/[doneText] instead (redrawn natively every hour). */
    val goalAt: Long? = null,
    val doneTitle: String? = null,
    val doneText: String? = null,
    /** Fast only: the status bar number is the hours since [chronometerBase], kept current natively. */
    val hourly: Boolean = false,
    /** Where a tap opens the app ("/fast", "/live"). */
    val path: String? = null,
) {
    fun toJson(): JSONObject =
        JSONObject().apply {
            put("kind", kind)
            put("title", title)
            put("text", text)
            chronometerBase?.let { put("chronometerBase", it) }
            put("countdown", countdown)
            number?.let { put("number", it) }
            progress?.let { put("progress", it) }
            color?.let { put("color", it) }
            goalAt?.let { put("goalAt", it) }
            doneTitle?.let { put("doneTitle", it) }
            doneText?.let { put("doneText", it) }
            put("hourly", hourly)
            path?.let { put("path", it) }
        }

    companion object {
        fun fromJson(o: JSONObject): LiveSpec =
            LiveSpec(
                kind = o.optString("kind", "fast"),
                title = o.optString("title", "Gloop"),
                text = o.optString("text", ""),
                chronometerBase = if (o.has("chronometerBase")) o.optLong("chronometerBase") else null,
                countdown = o.optBoolean("countdown", false),
                number = if (o.has("number")) o.optString("number") else null,
                progress = if (o.has("progress")) o.optDouble("progress") else null,
                color = if (o.has("color")) o.optInt("color") else null,
                goalAt = if (o.has("goalAt")) o.optLong("goalAt") else null,
                doneTitle = if (o.has("doneTitle")) o.optString("doneTitle") else null,
                doneText = if (o.has("doneText")) o.optString("doneText") else null,
                hourly = o.optBoolean("hourly", false),
                path = if (o.has("path")) o.optString("path") else null,
            )
    }
}

/** Channels, the drawn status-bar number, and posting/clearing the live notifications. */
object Live {
    const val CH_LIVE = "live"
    const val CH_ALERTS = "alerts"
    const val CH_TIMERS = "timers"

    const val ID_HR = 1001
    const val ID_FAST = 1002
    const val ID_TIMER = 1003
    const val ID_ALERT = 1004
    const val ID_TIMER_DONE = 1005

    const val EXTRA_PATH = "gloop.path"
    const val ACTION_FAST_TICK = "my.novas.gloop.FAST_TICK"

    private const val PREFS = "gloop-live"
    private const val HOUR = 3_600_000L

    /** The last spec shown per kind (the foreground service rebuilds its notification from 'hr'). */
    private val specs = HashMap<String, LiveSpec>()

    /** A path from a tapped notification, waiting for the page to ask for it. */
    @Volatile
    var pendingPath: String? = null

    fun idOf(kind: String) =
        when (kind) {
            "hr" -> ID_HR
            "fast" -> ID_FAST
            else -> ID_TIMER
        }

    fun specOf(kind: String): LiveSpec? = synchronized(specs) { specs[kind] }

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CH_LIVE) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CH_LIVE, "Live", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Heart rate, fasting and timers while they run"
                    setSound(null, null)
                    enableVibration(false)
                    setShowBadge(false)
                },
            )
        }
        if (nm.getNotificationChannel(CH_ALERTS) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CH_ALERTS, "Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Heart rate out of your target zone"
                    setSound(null, null)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 300, 150, 300, 150, 300)
                },
            )
        }
        if (nm.getNotificationChannel(CH_TIMERS) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CH_TIMERS, "Timers", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Rest and set timers ending"
                    val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                    setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), attrs)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 200, 100, 200, 100, 400)
                },
            )
        }
    }

    fun openIntent(ctx: Context, path: String?, code: Int): PendingIntent {
        val i =
            Intent(ctx, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                if (path != null) putExtra(EXTRA_PATH, path)
            }
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    // ---- the number in the status bar ---------------------------------------------------

    private val iconCache = object : LinkedHashMap<String, Icon>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Icon>?) = size > 48
    }

    /**
     * White digits on transparent, as large as fits a 24dp status-bar icon, condensed bold (how
     * speed-meter apps put a number in the status bar). Android tints it; only the alpha counts.
     */
    fun numberIcon(ctx: Context, text: String): Icon {
        synchronized(iconCache) { iconCache[text]?.let { return it } }
        val px = max(24, (24 * ctx.resources.displayMetrics.density).roundToInt())
        val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val paint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
                textAlign = Paint.Align.CENTER
                textSize = px.toFloat()
            }
        val b = Rect()
        paint.getTextBounds(text, 0, text.length, b)
        if (b.width() > 0 && b.height() > 0) {
            // fill the box: the full height for one or two digits, narrower text for three
            val k = min(px * 0.98f / b.width(), px * 0.92f / b.height())
            paint.textSize = paint.textSize * k
            paint.getTextBounds(text, 0, text.length, b)
        }
        canvas.drawText(text, px / 2f, px / 2f - b.exactCenterY(), paint)
        val icon = Icon.createWithBitmap(bmp)
        synchronized(iconCache) { iconCache[text] = icon }
        return icon
    }

    // ---- building and posting -----------------------------------------------------------------

    /** The spec as it should read right now (a fast past its goal, the hours fasted). */
    private fun current(s: LiveSpec, now: Long): LiveSpec {
        var out = s
        if (s.goalAt != null && now >= s.goalAt) {
            out = out.copy(title = s.doneTitle ?: s.title, text = s.doneText ?: s.text, progress = if (s.progress != null) 1.0 else null)
        }
        if (s.hourly && s.chronometerBase != null) {
            out = out.copy(number = ((now - s.chronometerBase).coerceAtLeast(0) / HOUR).toString())
            if (s.goalAt != null && s.goalAt > s.chronometerBase && now < s.goalAt) {
                out = out.copy(progress = (now - s.chronometerBase).toDouble() / (s.goalAt - s.chronometerBase))
            }
        }
        return out
    }

    fun build(ctx: Context, spec: LiveSpec): Notification {
        ensureChannels(ctx)
        val s = current(spec, System.currentTimeMillis())
        val b =
            Notification.Builder(ctx, CH_LIVE)
                .setContentTitle(s.title)
                .setContentText(s.text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(s.chronometerBase != null)
                .setCategory(if (s.kind == "fast") Notification.CATEGORY_PROGRESS else Notification.CATEGORY_WORKOUT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(openIntent(ctx, s.path ?: if (s.kind == "fast") "/fast" else "/live", idOf(s.kind)))
        if (s.number != null && s.number.isNotEmpty()) b.setSmallIcon(numberIcon(ctx, s.number)) else b.setSmallIcon(R.drawable.ic_stat_gloop)
        if (s.chronometerBase != null) {
            b.setWhen(s.chronometerBase)
            b.setUsesChronometer(true)
            b.setChronometerCountDown(s.countdown)
        }
        s.progress?.let { b.setProgress(1000, (it.coerceIn(0.0, 1.0) * 1000).roundToInt(), false) }
        s.color?.let {
            b.setColor(it)
        }
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        return b.build()
    }

    /** Show or update a live notification. 'hr' goes through the foreground service when it runs. */
    fun show(ctx: Context, spec: LiveSpec) {
        synchronized(specs) { specs[spec.kind] = spec }
        if (spec.kind == "fast") saveFast(ctx, spec)
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (!nm.areNotificationsEnabled()) return
        try {
            nm.notify(idOf(spec.kind), build(ctx, spec))
        } catch (e: SecurityException) {
            // notification permission revoked mid-run
        }
        if (spec.kind == "fast") armFastTick(ctx, spec)
    }

    fun clear(ctx: Context, kind: String) {
        synchronized(specs) { specs.remove(kind) }
        if (kind == "fast") {
            saveFast(ctx, null)
            cancelFastTick(ctx)
        }
        if (kind == "hr" && HrService.running) {
            // the service needs a notification while it runs: back to the plain "connected" one
            HrService.refresh(ctx)
            return
        }
        ctx.getSystemService(NotificationManager::class.java)?.cancel(idOf(kind))
    }

    /** An alerting notification (vibrates): zone alerts. */
    fun alert(ctx: Context, title: String, text: String, number: String?) {
        ensureChannels(ctx)
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val b =
            Notification.Builder(ctx, CH_ALERTS)
                .setContentTitle(title)
                .setContentText(text)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_STATUS)
                .setTimeoutAfter(60_000)
                .setContentIntent(openIntent(ctx, "/live", ID_ALERT))
        if (number != null) b.setSmallIcon(numberIcon(ctx, number)) else b.setSmallIcon(R.drawable.ic_stat_gloop)
        try {
            nm.notify(ID_ALERT, b.build())
        } catch (e: SecurityException) {
            // no permission
        }
    }

    /** "Rest is over": loud, on the Timers channel. */
    fun timerDone(ctx: Context, title: String, text: String, path: String?) {
        ensureChannels(ctx)
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val n =
            Notification.Builder(ctx, CH_TIMERS)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_stat_gloop)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setTimeoutAfter(5 * 60_000)
                .setContentIntent(openIntent(ctx, path ?: "/live", ID_TIMER_DONE))
                .build()
        try {
            nm.notify(ID_TIMER_DONE, n)
        } catch (e: SecurityException) {
            // no permission
        }
    }

    // ---- the fast survives the app closing: saved, redrawn every hour, restored after a reboot ----

    private fun saveFast(ctx: Context, spec: LiveSpec?) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (spec == null) p.remove("fast") else p.putString("fast", spec.toJson().toString())
        p.apply()
    }

    fun savedFast(ctx: Context): LiveSpec? =
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("fast", null)?.let { LiveSpec.fromJson(JSONObject(it)) }
        } catch (e: Exception) {
            null
        }

    private fun tickIntent(ctx: Context): PendingIntent =
        PendingIntent.getBroadcast(
            ctx,
            ID_FAST,
            Intent(ctx, LiveReceiver::class.java).setAction(ACTION_FAST_TICK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    /** Next redraw on the next whole hour of the fast (or at the goal, if that comes first). Inexact is fine. */
    private fun armFastTick(ctx: Context, spec: LiveSpec) {
        val base = spec.chronometerBase ?: return
        if (!spec.hourly && spec.goalAt == null) return
        val now = System.currentTimeMillis()
        var next = base + ((now - base) / HOUR + 1) * HOUR
        if (spec.goalAt != null && spec.goalAt in (now + 1) until next) next = spec.goalAt
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        am.setAndAllowWhileIdle(AlarmManager.RTC, next + 1000, tickIntent(ctx))
    }

    private fun cancelFastTick(ctx: Context) {
        ctx.getSystemService(AlarmManager::class.java)?.cancel(tickIntent(ctx))
    }

    /** From the tick alarm or after a reboot: redraw the saved fast and arm the next tick. */
    fun restoreFast(ctx: Context) {
        val s = savedFast(ctx) ?: return
        // a fast forgotten for a day past its goal stops updating (same rule as the web push)
        if (s.goalAt != null && System.currentTimeMillis() > s.goalAt + 24 * HOUR) return
        show(ctx, s)
    }
}

// Capacitor's getLong/getInt/getDouble only accept that exact boxed type, but JSON numbers arrive
// as Integer, Long or Double depending on their size: read any number.
fun com.getcapacitor.PluginCall.num(name: String): Number? = data.opt(name) as? Number

fun com.getcapacitor.PluginCall.long(name: String): Long? = num(name)?.let { if (it is Double || it is Float) Math.round(it.toDouble()) else it.toLong() }

fun com.getcapacitor.PluginCall.int(name: String): Int? = long(name)?.toInt()

fun com.getcapacitor.PluginCall.double(name: String): Double? = num(name)?.toDouble()
