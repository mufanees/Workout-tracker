package my.novas.gloop

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.widget.ArrayAdapter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Bluetooth heart rate (Heart Rate Service 0x180D) through Android's BLE stack and [HrService].
 * JS: pick() → {id, name}; connect({deviceId, name}); disconnect(); status(); drain({after});
 * configure({...}); events 'hr' {seq, at, bpm, rr[]}, 'hrBatch' {samples}, 'status' {state, deviceId, name}.
 */
@CapacitorPlugin(
    name = "HeartRate",
    permissions = [
        Permission(alias = "bluetooth", strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT]),
        Permission(alias = "location", strings = [Manifest.permission.ACCESS_FINE_LOCATION]),
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
    ],
)
class HeartRatePlugin : Plugin(), HrSink {
    private val main = Handler(Looper.getMainLooper())
    private var resumed = true
    private var delivered = 0L
    private var scanning: ScanCallback? = null

    /** Android 12+ asks for "Nearby devices"; older versions need location to scan. */
    private val btAlias get() = if (Build.VERSION.SDK_INT >= 31) "bluetooth" else "location"

    override fun load() {
        HrService.sink = this
    }

    override fun handleOnDestroy() {
        if (HrService.sink === this) HrService.sink = null
        stopScan()
    }

    override fun handleOnPause() {
        resumed = false
    }

    override fun handleOnResume() {
        resumed = true
        flush()
    }

    // ---- events from the service -----------------------------------------------------------

    override fun onSample(s: HrSample) {
        if (!resumed) return // kept in the ring; flushed on resume (and the page can drain())
        if (s.seq <= delivered) return
        delivered = s.seq
        notifyListeners("hr", sampleJson(s))
    }

    override fun onState(state: String) {
        notifyListeners("status", statusJson())
    }

    private fun flush() {
        val missed = HrService.since(delivered)
        if (missed.isEmpty()) return
        delivered = missed.last().seq
        val arr = JSArray()
        for (s in missed) arr.put(sampleJson(s))
        notifyListeners("hrBatch", JSObject().put("samples", arr))
    }

    private fun sampleJson(s: HrSample): JSObject {
        val rr = JSArray()
        for (x in s.rr) rr.put(Math.round(x * 10) / 10.0)
        return JSObject().put("seq", s.seq).put("at", s.at).put("bpm", s.bpm).put("rr", rr)
    }

    private fun statusJson(): JSObject {
        val o = JSObject().put("state", HrService.state).put("running", HrService.running)
        HrService.strapId?.let { o.put("deviceId", it) }
        HrService.strapName?.let { o.put("name", it) }
        HrService.last()?.let {
            o.put("bpm", it.bpm)
            o.put("at", it.at)
            o.put("seq", it.seq)
        }
        return o
    }

    // ---- methods -----------------------------------------------------------------------------

    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(statusJson())
    }

    /** Everything after `after` (a seq) that's still in the ring: what the page missed while frozen. */
    @PluginMethod
    fun drain(call: PluginCall) {
        val after = call.long("after") ?: 0L
        HrService.pageSeenAt = System.currentTimeMillis()
        val arr = JSArray()
        val list = HrService.since(after)
        for (s in list) arr.put(sampleJson(s))
        if (list.isNotEmpty()) delivered = maxOf(delivered, list.last().seq)
        call.resolve(JSObject().put("samples", arr))
    }

    /** Zones, target and quiet periods, so the service can carry on while the page is frozen. */
    @PluginMethod
    fun configure(call: PluginCall) {
        val zones =
            try {
                call.getArray("zones")?.toList<Any>()?.map { (it as Number).toInt() }?.toIntArray()
            } catch (e: Exception) {
                null
            }
        HrService.config =
            HrConfig(
                zones = if (zones != null && zones.size == 4) zones else HrService.config.zones,
                target = call.int("target"),
                startedAt = call.long("startedAt"),
                quietUntil = call.long("quietUntil"),
                quietFrom = call.long("quietFrom"),
                alerts = call.getBoolean("alerts", true) ?: true,
            )
        HrService.pageSeenAt = System.currentTimeMillis()
        call.resolve()
    }

    private fun granted(alias: String) = getPermissionState(alias) == PermissionState.GRANTED

    private fun askThen(call: PluginCall, callback: String) {
        val aliases = if (Build.VERSION.SDK_INT >= 33) arrayOf(btAlias, "notifications") else arrayOf(btAlias)
        requestPermissionForAliases(aliases, call, callback)
    }

    /** Scan for straps and let the person choose one in a native list. */
    @PluginMethod
    fun pick(call: PluginCall) {
        if (!granted(btAlias)) return askThen(call, "afterPickPermission")
        doPick(call)
    }

    @PermissionCallback
    private fun afterPickPermission(call: PluginCall) {
        if (!granted(btAlias)) return call.reject("Gloop needs Nearby devices permission to find your strap", "permission")
        doPick(call)
    }

    /** Connect to a strap (from pick() or remembered) and keep it connected in the foreground service. */
    @PluginMethod
    fun connect(call: PluginCall) {
        if (!granted(btAlias)) return askThen(call, "afterConnectPermission")
        doConnect(call)
    }

    @PermissionCallback
    private fun afterConnectPermission(call: PluginCall) {
        if (!granted(btAlias)) return call.reject("Gloop needs Nearby devices permission to connect", "permission")
        doConnect(call)
    }

    private fun doConnect(call: PluginCall) {
        val id = call.getString("deviceId") ?: return call.reject("deviceId is required")
        if (!BluetoothAdapter.checkBluetoothAddress(id)) return call.reject("Not a Bluetooth address", "bad-id")
        try {
            HrService.start(context, id, call.getString("name"))
        } catch (e: Exception) {
            return call.reject("Couldn’t start the heart-rate service: ${e.message}", "service")
        }
        call.resolve(JSObject().put("deviceId", id))
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        HrService.stop(context)
        Live.clear(context, "hr")
        call.resolve()
    }

    // ---- the native picker ------------------------------------------------------------------------

    @SuppressLint("MissingPermission")
    private fun doPick(call: PluginCall) {
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return call.reject("This phone has no Bluetooth", "no-bluetooth")
        if (!adapter.isEnabled) {
            try {
                activity.startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            } catch (e: Exception) {
                // can't ask; the message says what to do
            }
            return call.reject("Turn Bluetooth on, then try again", "bluetooth-off")
        }
        val scanner = adapter.bluetoothLeScanner ?: return call.reject("Bluetooth isn’t ready", "no-scanner")
        activity.runOnUiThread {
            val ids = ArrayList<String>()
            val names = ArrayList<String>()
            val labels = ArrayList<String>()
            val list = ArrayAdapter(activity, android.R.layout.select_dialog_item, labels)
            var settled = false
            lateinit var dialog: AlertDialog
            val finish = { result: JSObject? ->
                if (!settled) {
                    settled = true
                    stopScan()
                    if (result != null) call.resolve(result) else call.reject("No strap chosen", "cancelled")
                }
            }
            val cb =
                object : ScanCallback() {
                    override fun onScanResult(type: Int, r: ScanResult) {
                        val id = r.device.address
                        val name = r.scanRecord?.deviceName ?: r.device.name ?: "Heart rate monitor"
                        main.post {
                            if (settled || ids.contains(id)) return@post
                            ids.add(id)
                            names.add(name)
                            labels.add("$name  ·  ${id.takeLast(5)}")
                            list.notifyDataSetChanged()
                            dialog.setTitle("Choose your strap")
                        }
                    }

                    override fun onScanFailed(errorCode: Int) {
                        main.post {
                            dialog.dismiss()
                            finish(null)
                        }
                    }
                }
            dialog =
                AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle("Looking for heart rate straps…")
                    .setAdapter(list) { _, which ->
                        finish(JSObject().put("id", ids[which]).put("name", names[which]))
                    }
                    .setNegativeButton("Cancel") { _, _ -> finish(null) }
                    .setOnDismissListener { finish(null) }
                    .create()
            dialog.show()
            scanning = cb
            try {
                val filters = listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(HrService.HR_SERVICE)).build())
                val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
                scanner.startScan(filters, settings, cb)
            } catch (e: Exception) {
                dialog.dismiss()
                finish(null)
                return@runOnUiThread
            }
            // stop looking after 30 s; whatever was found stays in the list
            main.postDelayed({
                if (!settled && scanning === cb) {
                    stopScan()
                    if (ids.isEmpty()) dialog.setTitle("No straps found. Wet the strap’s pads and put it on.")
                }
            }, 30_000)
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        val cb = scanning ?: return
        scanning = null
        try {
            context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner?.stopScan(cb)
        } catch (e: Exception) {
            // Bluetooth turned off meanwhile
        }
    }
}
