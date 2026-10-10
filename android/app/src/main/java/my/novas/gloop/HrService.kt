package my.novas.gloop

import android.Manifest
import android.annotation.SuppressLint
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import java.util.UUID

/** One heart-rate measurement: when it arrived, bpm, beat-to-beat intervals in ms. */
data class HrSample(val seq: Long, val at: Long, val bpm: Int, val rr: DoubleArray)

/** What the HeartRate plugin hears from the service. */
interface HrSink {
    fun onSample(s: HrSample)

    fun onState(state: String)
}

/** Zones and target from the page, so the service can keep the notification and zone alerts going while it's frozen. */
data class HrConfig(
    /** Upper bpm of zones 1–4. */
    val zones: IntArray = intArrayOf(119, 145, 160, 175),
    val target: Int? = null,
    /** The workout's start (the notification's clock). */
    val startedAt: Long? = null,
    /** No zone alerts before this (warm-up) … */
    val quietUntil: Long? = null,
    /** … or from this on (cool-down). */
    val quietFrom: Long? = null,
    val alerts: Boolean = true,
)

/**
 * Foreground service (type connectedDevice, plus health when Android allows it) that holds the
 * strap's Bluetooth connection, so recording goes on with the screen off and Gloop in the
 * background. Samples are kept in a ring with sequence numbers; the page drains what it missed.
 */
@SuppressLint("MissingPermission") // checked by the plugin before starting; a revoked permission just disconnects
class HrService : Service() {
    companion object {
        const val ACTION_START = "my.novas.gloop.HR_START"
        const val ACTION_STOP = "my.novas.gloop.HR_STOP"
        const val EXTRA_DEVICE = "device"
        const val EXTRA_NAME = "name"

        val HR_SERVICE: UUID = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb")
        val HR_MEASUREMENT: UUID = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb")
        val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private const val RING = 20_000 // ~5.5 h at one sample a second

        @Volatile
        var running = false
            private set

        @Volatile
        var state = "off"
            private set

        @Volatile
        var strapId: String? = null
            private set

        @Volatile
        var strapName: String? = null
            private set

        @Volatile
        var sink: HrSink? = null

        @Volatile
        var config = HrConfig()

        /** When the page last spoke (a notification update or a config): silent for long = frozen. */
        @Volatile
        var pageSeenAt = 0L

        private val ring = ArrayDeque<HrSample>()
        private var seq = 0L

        fun last(): HrSample? = synchronized(ring) { ring.lastOrNull() }

        /** Samples after `after` (a seq), oldest first. */
        fun since(after: Long): List<HrSample> = synchronized(ring) { ring.filter { it.seq > after } }

        internal fun record(at: Long, bpm: Int, rr: DoubleArray): HrSample =
            synchronized(ring) {
                val s = HrSample(++seq, at, bpm, rr)
                ring.addLast(s)
                while (ring.size > RING) ring.removeFirst()
                s
            }

        fun start(ctx: Context, device: String, name: String?) {
            val i = Intent(ctx, HrService::class.java).setAction(ACTION_START).putExtra(EXTRA_DEVICE, device).putExtra(EXTRA_NAME, name)
            ctx.startForegroundService(i)
        }

        fun stop(ctx: Context) {
            if (!running) return
            try {
                ctx.startService(Intent(ctx, HrService::class.java).setAction(ACTION_STOP))
            } catch (e: IllegalStateException) {
                // not allowed from the background on some versions: stopService ends it all the same
                ctx.stopService(Intent(ctx, HrService::class.java))
            }
        }

        /** Redraw the service's notification from the page's last 'hr' spec (or the plain one). */
        fun refresh(ctx: Context) {
            if (!running) return
            val nm = ctx.getSystemService(android.app.NotificationManager::class.java) ?: return
            try {
                nm.notify(Live.ID_HR, Live.build(ctx, Live.specOf("hr") ?: plainSpec()))
            } catch (e: SecurityException) {
                // notifications off
            }
        }

        private fun plainSpec() =
            LiveSpec(
                kind = "hr",
                title = if (state == "connected") "${strapName ?: "Heart rate"} connected" else "Looking for ${strapName ?: "your strap"}…",
                text = last()?.let { "${it.bpm} bpm" } ?: "Gloop keeps recording with the screen off",
                number = last()?.takeIf { System.currentTimeMillis() - it.at < 6000 }?.bpm?.toString(),
                path = "/live",
            )

        /** bpm → zone 1..5 by the page's bounds. */
        fun zoneOf(bpm: Int, z: IntArray): Int {
            for (i in 0 until minOf(4, z.size)) if (bpm <= z[i]) return i + 1
            return 5
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private var gatt: BluetoothGatt? = null
    private var wanted = false
    private var retries = 0
    private var outSince = 0L
    private var alertAt = 0L
    private var nativeShownAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                shutdown()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val id = intent.getStringExtra(EXTRA_DEVICE)
                if (id == null) {
                    shutdown()
                    return START_NOT_STICKY
                }
                if (!goForeground()) return START_NOT_STICKY
                if (id != strapId || gatt == null) {
                    closeGatt()
                    strapId = id
                    strapName = intent.getStringExtra(EXTRA_NAME) ?: strapName
                    wanted = true
                    retries = 0
                    connect(false)
                } else {
                    setState(state)
                }
            }
        }
        return START_NOT_STICKY
    }

    private fun hasPermission(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    /** startForeground with the types whose prerequisites are met (Android 14+ checks them). */
    private fun goForeground(): Boolean {
        running = true
        val n = Live.build(this, Live.specOf("hr") ?: plainSpec())
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                // 'health' needs one of these runtime permissions on 14+; add it only when held
                if (Build.VERSION.SDK_INT >= 34 &&
                    (hasPermission(Manifest.permission.ACTIVITY_RECOGNITION) || hasPermission(Manifest.permission.BODY_SENSORS))
                ) {
                    types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
                }
                startForeground(Live.ID_HR, n, types)
            } else {
                startForeground(Live.ID_HR, n)
            }
            return true
        } catch (e: Exception) {
            // missing BLUETOOTH_CONNECT, or started from the background: give up cleanly
            running = false
            setState("off")
            stopSelf()
            return false
        }
    }

    private fun setState(s: String) {
        state = s
        sink?.onState(s)
        refresh(this)
    }

    private fun connect(auto: Boolean) {
        val id = strapId ?: return
        if (Build.VERSION.SDK_INT >= 31 && !hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
            shutdown()
            return
        }
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null || !adapter.isEnabled) {
            setState("reconnecting")
            retryLater()
            return
        }
        val device: BluetoothDevice =
            try {
                adapter.getRemoteDevice(id)
            } catch (e: IllegalArgumentException) {
                shutdown()
                return
            }
        setState(if (retries == 0 && !auto) "connecting" else "reconnecting")
        gatt = device.connectGatt(this, auto, callback, BluetoothDevice.TRANSPORT_LE)
    }

    /** Straps drop out when taken off or out of range: back off to 30 s, then let Android wait for it. */
    private fun retryLater() {
        main.removeCallbacksAndMessages(null)
        if (!wanted) return
        val delay = minOf(30_000L, 1000L shl minOf(retries, 5))
        val auto = retries >= 4
        retries++
        main.postDelayed({
            if (!wanted) return@postDelayed
            closeGatt()
            connect(auto)
        }, delay)
    }

    private fun closeGatt() {
        try {
            gatt?.close()
        } catch (e: Exception) {
            // already closed
        }
        gatt = null
    }

    private val callback =
        object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                main.post {
                    if (g !== gatt) return@post
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        g.discoverServices()
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        closeGatt()
                        if (wanted) {
                            setState("reconnecting")
                            retryLater()
                        }
                    }
                }
            }

            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                main.post {
                    if (g !== gatt) return@post
                    val ch = g.getService(HR_SERVICE)?.getCharacteristic(HR_MEASUREMENT)
                    if (ch == null) {
                        // not a heart-rate strap (or services not ready): drop and retry
                        g.disconnect()
                        return@post
                    }
                    g.setCharacteristicNotification(ch, true)
                    val d = ch.getDescriptor(CCCD)
                    if (d != null) {
                        if (Build.VERSION.SDK_INT >= 33) {
                            g.writeDescriptor(d, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                        } else {
                            @Suppress("DEPRECATION")
                            d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                            @Suppress("DEPRECATION")
                            g.writeDescriptor(d)
                        }
                    }
                    retries = 0
                    setState("connected")
                }
            }

            // Android 13+
            override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) {
                if (ch.uuid == HR_MEASUREMENT) onMeasurement(value)
            }

            // Android 12 and older
            @Suppress("OVERRIDE_DEPRECATION")
            override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
                if (Build.VERSION.SDK_INT >= 33) return
                @Suppress("DEPRECATION")
                val v = ch.value ?: return
                if (ch.uuid == HR_MEASUREMENT) onMeasurement(v)
            }
        }

    private fun onMeasurement(v: ByteArray) {
        val m = HrParser.parse(v) ?: return
        if (m.first <= 0 || m.first >= 250) return
        val s = record(System.currentTimeMillis(), m.first, m.second)
        main.post {
            if (state != "connected") setState("connected")
            sink?.onSample(s)
            whilePageIsQuiet(s)
        }
    }

    /**
     * The page normally writes the notification (zone names, phases). When it has been silent for a
     * while (WebView frozen, app swiped away) the service keeps the number current and does the
     * zone alerts itself.
     */
    private fun whilePageIsQuiet(s: HrSample) {
        val now = s.at
        if (now - pageSeenAt < 10_000) {
            outSince = 0
            return
        }
        val c = config
        val z = zoneOf(s.bpm, c.zones)
        val target = c.target
        val quiet = !c.alerts || target == null || (c.quietUntil != null && now < c.quietUntil) || (c.quietFrom != null && now >= c.quietFrom)
        val text =
            when {
                target == null || quiet -> if (c.startedAt != null) "Recording" else "Gloop keeps recording with the screen off"
                z == target -> "In zone"
                z < target -> "Below zone $target · pick it up"
                else -> "Above zone $target · ease off"
            }
        if (now - nativeShownAt >= 2000) {
            nativeShownAt = now
            val prev = Live.specOf("hr")
            val spec =
                LiveSpec(
                    kind = "hr",
                    title = "${s.bpm} bpm · Zone $z",
                    text = text,
                    chronometerBase = c.startedAt ?: prev?.chronometerBase,
                    number = s.bpm.toString(),
                    color = prev?.color,
                    path = "/live",
                )
            val nm = getSystemService(android.app.NotificationManager::class.java)
            try {
                nm?.notify(Live.ID_HR, Live.build(this, spec))
            } catch (e: SecurityException) {
                // notifications off
            }
        }
        if (quiet || z == target) {
            outSince = 0
            return
        }
        if (outSince == 0L) outSince = now
        // 15 s out of zone before a nudge, at most one a minute (as on the page)
        if (now - outSince >= 15_000 && now - alertAt >= 60_000) {
            alertAt = now
            val title = if (z > target) "Above zone $target. Ease off a little." else "Below zone $target. Pick it up a little."
            Live.alert(this, title, "${s.bpm} bpm now · aim for zone $target", s.bpm.toString())
        }
    }

    private fun shutdown() {
        wanted = false
        main.removeCallbacksAndMessages(null)
        try {
            gatt?.disconnect()
        } catch (e: Exception) {
            // ignore
        }
        closeGatt()
        strapId = null
        running = false
        state = "off"
        sink?.onState("off")
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        wanted = false
        main.removeCallbacksAndMessages(null)
        closeGatt()
        running = false
        if (state != "off") {
            state = "off"
            sink?.onState("off")
        }
        super.onDestroy()
    }
}

/** Heart Rate Measurement (0x2A37): flags, bpm (8 or 16 bit), optional energy, optional R-R (1/1024 s). */
object HrParser {
    fun parse(v: ByteArray): Pair<Int, DoubleArray>? {
        if (v.size < 2) return null
        val flags = v[0].toInt() and 0xff
        var i = 1
        val hr: Int
        if (flags and 0x01 != 0) {
            if (v.size < 3) return null
            hr = (v[1].toInt() and 0xff) or ((v[2].toInt() and 0xff) shl 8)
            i = 3
        } else {
            hr = v[1].toInt() and 0xff
            i = 2
        }
        if (flags and 0x08 != 0) i += 2 // energy expended
        val rr = ArrayList<Double>()
        if (flags and 0x10 != 0) {
            while (i + 1 < v.size) {
                val raw = (v[i].toInt() and 0xff) or ((v[i + 1].toInt() and 0xff) shl 8)
                rr.add(raw / 1024.0 * 1000.0)
                i += 2
            }
        }
        return Pair(hr, rr.toDoubleArray())
    }
}
