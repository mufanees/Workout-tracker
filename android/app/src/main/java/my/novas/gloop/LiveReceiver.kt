package my.novas.gloop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Alarms Gloop sets for itself: a timer ran out, or the fast notification's hourly redraw. Not exported. */
class LiveReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Live.ACTION_FAST_TICK -> Live.restoreFast(ctx)
            Timers.ACTION_TIMER -> {
                Timers.forget(ctx, intent.getStringExtra(Timers.EXTRA_ID) ?: "")
                // the countdown in the shade is over either way
                if (intent.getBooleanExtra(Timers.EXTRA_CLEARS_LIVE, true)) Live.clear(ctx, "timer")
                // on screen, the page beeps itself (same rule as the web push: only when it couldn't)
                if (!AppState.foreground) {
                    Live.timerDone(
                        ctx,
                        intent.getStringExtra(Timers.EXTRA_TITLE) ?: "Time’s up",
                        intent.getStringExtra(Timers.EXTRA_TEXT) ?: "",
                        intent.getStringExtra(Timers.EXTRA_PATH),
                    )
                }
            }
        }
    }
}

/** After a reboot: put the running fast back in the shade. (Timers are not restored; they'd be long over.) */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Live.restoreFast(ctx)
        }
    }
}
