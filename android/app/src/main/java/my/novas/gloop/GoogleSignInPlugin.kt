package my.novas.gloop

import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/**
 * Google sign-in inside the app. Google doesn't allow its web sign-in in an app's WebView (the popup ends on a
 * blank accounts.google.com/gsi/transform page), so the app asks Android's Credential Manager instead: the
 * system account sheet, which returns the same Google ID token the website gets. `clientId` is the website's
 * OAuth client (the token's audience), so the server checks it exactly as before. Google also needs an Android
 * OAuth client for package my.novas.gloop with this build's signing SHA-1, or it answers "developer error".
 */
@CapacitorPlugin(name = "GoogleSignIn")
class GoogleSignInPlugin : Plugin() {
    /** signIn({ clientId }) → { credential } (a Google ID token), or rejects with code cancelled / no-account / failed. */
    @PluginMethod
    fun signIn(call: PluginCall) {
        val clientId = call.getString("clientId")
        if (clientId.isNullOrBlank()) return call.reject("No Google client id", "failed")
        val option = GetSignInWithGoogleOption.Builder(clientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        CredentialManager.create(activity).getCredentialAsync(
            activity,
            request,
            CancellationSignal(),
            ContextCompat.getMainExecutor(context),
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    val cred = result.credential
                    if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                        try {
                            val token = GoogleIdTokenCredential.createFrom(cred.data).idToken
                            call.resolve(JSObject().put("credential", token))
                        } catch (e: Exception) {
                            call.reject("Google's answer couldn't be read: ${e.message}", "failed")
                        }
                    } else {
                        call.reject("Google answered with an unexpected kind of sign-in", "failed")
                    }
                }

                override fun onError(e: GetCredentialException) {
                    when (e) {
                        is GetCredentialCancellationException -> call.reject("Cancelled", "cancelled")
                        is NoCredentialException -> call.reject("No Google account on this phone", "no-account")
                        else -> call.reject("${e.type}: ${e.message ?: "Google sign-in failed"}", "failed")
                    }
                }
            },
        )
    }
}
