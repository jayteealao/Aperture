package uk.adedamola.aperture.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import uk.adedamola.aperture.ui.theme.HudBlack
import uk.adedamola.aperture.ui.theme.HudError
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudInfo
import uk.adedamola.aperture.ui.theme.HudSuccess
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWarning
import uk.adedamola.aperture.ui.theme.HudWhite

enum class ToastType {
    SUCCESS, ERROR, WARNING, INFO
}

data class ToastData(
    val message: String,
    val type: ToastType = ToastType.INFO,
    val durationMs: Long = 4000,
    val action: String? = null,
    val onAction: (() -> Unit)? = null
)

@Composable
fun HudToast(
    data: ToastData,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    var visible by remember { mutableStateOf(true) }

    val (icon, color) = when (data.type) {
        ToastType.SUCCESS -> Icons.Default.Check to HudSuccess
        ToastType.ERROR -> Icons.Default.Error to HudError
        ToastType.WARNING -> Icons.Default.Warning to HudWarning
        ToastType.INFO -> Icons.Default.Info to HudInfo
    }

    LaunchedEffect(data) {
        delay(data.durationMs)
        visible = false
        delay(300) // Wait for animation
        onDismiss()
    }

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn() + slideInVertically { -it },
        exit = fadeOut() + slideOutVertically { -it }
    ) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .padding(16.dp)
                .background(HudBlack)
                .border(1.dp, color.copy(alpha = 0.5f))
                .hudCornerBrackets(
                    color = color,
                    bracketLength = 8.dp,
                    strokeWidth = 1.dp
                )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Icon
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(20.dp)
                )

                Spacer(modifier = Modifier.width(12.dp))

                // Message
                Text(
                    text = data.message,
                    color = HudWhite,
                    fontSize = 14.sp,
                    modifier = Modifier.weight(1f)
                )

                // Action button
                if (data.action != null && data.onAction != null) {
                    HudTextButton(
                        onClick = {
                            data.onAction.invoke()
                            visible = false
                        },
                        text = data.action
                    )
                }

                // Close button
                IconButton(
                    onClick = {
                        visible = false
                        onDismiss()
                    },
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Dismiss",
                        tint = HudText,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

/**
 * Toast host for managing multiple toasts
 */
class ToastHostState {
    private val _toasts = mutableListOf<ToastData>()
    val currentToast: ToastData? get() = _toasts.firstOrNull()

    fun showToast(data: ToastData) {
        _toasts.add(data)
    }

    fun showToast(
        message: String,
        type: ToastType = ToastType.INFO,
        durationMs: Long = 4000
    ) {
        showToast(ToastData(message, type, durationMs))
    }

    fun dismiss() {
        if (_toasts.isNotEmpty()) {
            _toasts.removeAt(0)
        }
    }

    fun success(message: String) = showToast(message, ToastType.SUCCESS)
    fun error(message: String) = showToast(message, ToastType.ERROR)
    fun warning(message: String) = showToast(message, ToastType.WARNING)
    fun info(message: String) = showToast(message, ToastType.INFO)
}

@Composable
fun rememberToastHostState(): ToastHostState {
    return remember { ToastHostState() }
}

@Composable
fun HudToastHost(
    state: ToastHostState,
    modifier: Modifier = Modifier
) {
    Box(modifier = modifier) {
        state.currentToast?.let { toast ->
            HudToast(
                data = toast,
                onDismiss = { state.dismiss() }
            )
        }
    }
}
