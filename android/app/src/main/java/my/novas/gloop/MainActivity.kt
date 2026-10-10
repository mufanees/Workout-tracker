package my.novas.gloop

import android.os.Bundle
import com.getcapacitor.BridgeActivity

/** The Capacitor WebView showing https://gloop.novas.my, plus Gloop's local plugins. */
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // local plugins must be registered before the bridge starts
        registerPlugin(HeartRatePlugin::class.java)
        registerPlugin(LiveNotificationPlugin::class.java)
        registerPlugin(TimersPlugin::class.java)
        registerPlugin(PhonePlugin::class.java)
        registerPlugin(OnDeviceAIPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onResume() {
        super.onResume()
        AppState.foreground = true
    }

    override fun onPause() {
        AppState.foreground = false
        super.onPause()
    }
}
