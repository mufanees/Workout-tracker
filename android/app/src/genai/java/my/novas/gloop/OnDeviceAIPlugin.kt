package my.novas.gloop

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

/**
 * Gemini Nano on the phone through ML Kit's GenAI Prompt API (com.google.mlkit:genai-prompt, beta).
 * Built only with -Pgloop.genai=true (the default); src/nogenai has a stand-in that always says
 * 'unavailable'. JS: status() → { status: 'available' | 'downloadable' | 'downloading' | 'unavailable' };
 * download() (Settings only, never mid-workout) with 'aiDownload' events; prompt({ system?, text,
 * maxTokens?, timeoutMs? }) → { text }, foreground only, and never starts a download.
 */
@CapacitorPlugin(name = "OnDeviceAI")
class OnDeviceAIPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var model: GenerativeModel? = null
    private var downloading = false

    private fun model(): GenerativeModel = model ?: Generation.getClient().also { model = it }

    private fun name(s: Int): String =
        when (s) {
            FeatureStatus.AVAILABLE -> "available"
            FeatureStatus.DOWNLOADABLE -> "downloadable"
            FeatureStatus.DOWNLOADING -> "downloading"
            else -> "unavailable"
        }

    @PluginMethod
    fun status(call: PluginCall) {
        scope.launch {
            try {
                val s = withTimeout(8_000) { model().checkStatus() }
                call.resolve(JSObject().put("status", if (downloading && s != FeatureStatus.AVAILABLE) "downloading" else name(s)).put("engine", "mlkit-genai-prompt"))
            } catch (e: Throwable) {
                // AICore missing, still initialising after a reset, or the API changed: treat as unavailable
                call.resolve(JSObject().put("status", "unavailable").put("error", e.message ?: e.javaClass.simpleName))
            }
        }
    }

    /** Start (or join) the model download. Resolves when it finishes; progress comes as 'aiDownload' events. */
    @PluginMethod
    fun download(call: PluginCall) {
        if (downloading) return call.resolve(JSObject().put("status", "downloading"))
        downloading = true
        scope.launch {
            try {
                model().download().collect { st ->
                    when (st) {
                        is DownloadStatus.DownloadStarted -> notifyListeners("aiDownload", JSObject().put("state", "started"))
                        is DownloadStatus.DownloadProgress -> notifyListeners("aiDownload", JSObject().put("state", "progress").put("bytes", st.totalBytesDownloaded))
                        is DownloadStatus.DownloadCompleted -> {
                            notifyListeners("aiDownload", JSObject().put("state", "done"))
                        }
                        is DownloadStatus.DownloadFailed -> {
                            notifyListeners("aiDownload", JSObject().put("state", "failed").put("error", st.e.message ?: "failed"))
                        }
                        else -> Unit
                    }
                }
                val s = model().checkStatus()
                call.resolve(JSObject().put("status", name(s)))
            } catch (e: Throwable) {
                call.reject(e.message ?: "Download failed", "download")
            } finally {
                downloading = false
            }
        }
    }

    @PluginMethod
    fun prompt(call: PluginCall) {
        val text = call.getString("text")
        if (text.isNullOrBlank()) return call.reject("text is required")
        // AICore only serves apps in the foreground; don't even try from the background
        if (!AppState.foreground) return call.reject("Gloop is in the background", "background")
        val system = call.getString("system")
        val maxTokens = (call.int("maxTokens") ?: 256).coerceIn(16, 1024)
        val timeout = (call.long("timeoutMs") ?: 8_000L).coerceIn(1_000L, 60_000L)
        val full = if (system.isNullOrBlank()) text else "$system\n\n$text"
        scope.launch {
            try {
                val out =
                    withTimeout(timeout) {
                        val m = model()
                        // never download from here: only an already-present model answers
                        if (m.checkStatus() != FeatureStatus.AVAILABLE) throw IllegalStateException("unavailable")
                        val res =
                            m.generateContent(
                                generateContentRequest(TextPart(full)) {
                                    temperature = 0.3f
                                    maxOutputTokens = maxTokens
                                },
                            )
                        res.candidates.firstOrNull()?.text ?: ""
                    }
                call.resolve(JSObject().put("text", out))
            } catch (e: TimeoutCancellationException) {
                call.reject("The on-device model took too long", "timeout")
            } catch (e: IllegalStateException) {
                call.reject("The on-device model isn’t ready", "unavailable")
            } catch (e: Throwable) {
                call.reject(e.message ?: "On-device model failed", "error")
            }
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
        try {
            (model as? AutoCloseable)?.close()
        } catch (e: Exception) {
            // ignore
        }
        model = null
    }
}
