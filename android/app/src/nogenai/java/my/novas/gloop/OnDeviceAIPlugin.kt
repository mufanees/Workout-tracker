package my.novas.gloop

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Stand-in used when the app is built with -Pgloop.genai=false (ML Kit GenAI left out, e.g. when its
 * beta artifact can't be resolved). Same plugin name and methods; the model is always 'unavailable'.
 */
@CapacitorPlugin(name = "OnDeviceAI")
class OnDeviceAIPlugin : Plugin() {
    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(JSObject().put("status", "unavailable").put("engine", "none").put("error", "Built without on-device AI"))
    }

    @PluginMethod
    fun download(call: PluginCall) {
        call.reject("This build has no on-device AI", "unavailable")
    }

    @PluginMethod
    fun prompt(call: PluginCall) {
        call.reject("This build has no on-device AI", "unavailable")
    }
}
