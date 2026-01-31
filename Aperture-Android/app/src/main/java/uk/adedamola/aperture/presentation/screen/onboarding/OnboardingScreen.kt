package uk.adedamola.aperture.presentation.screen.onboarding

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.adedamola.aperture.ui.components.HudBadge
import uk.adedamola.aperture.ui.components.HudBadgeVariant
import uk.adedamola.aperture.ui.components.HudTextButton
import uk.adedamola.aperture.ui.components.HudInput
import uk.adedamola.aperture.ui.components.HudSpinner
import uk.adedamola.aperture.ui.components.layout.HudSimpleShell
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudSuccess
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun OnboardingScreen(
    onConnected: () -> Unit,
    viewModel: OnboardingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    HudSimpleShell {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 400.dp)
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Animated Aperture Logo
                ApertureLogo(
                    modifier = Modifier.size(100.dp),
                    isConnecting = uiState.connectionStatus is ConnectionTestStatus.Testing
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Title
                Text(
                    text = "APERTURE",
                    color = HudWhite,
                    fontSize = 28.sp,
                    letterSpacing = 6.sp
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "Gateway Control Interface",
                    color = HudText,
                    fontSize = 12.sp,
                    letterSpacing = 2.sp
                )

                Spacer(modifier = Modifier.height(48.dp))

                // Gateway URL input
                HudInput(
                    value = uiState.gatewayUrl,
                    onValueChange = viewModel::updateGatewayUrl,
                    label = "Gateway URL",
                    placeholder = "http://localhost:7080",
                    leadingIcon = Icons.Default.Link,
                    enabled = !uiState.isLoading,
                    imeAction = ImeAction.Next,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(16.dp))

                // API Token input
                HudInput(
                    value = uiState.apiToken,
                    onValueChange = viewModel::updateApiToken,
                    label = "API Token",
                    placeholder = "Enter your API token",
                    leadingIcon = Icons.Default.VpnKey,
                    isPassword = true,
                    enabled = !uiState.isLoading,
                    imeAction = ImeAction.Done,
                    onImeAction = { viewModel.testConnection(onConnected) },
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Connection status badge
                when (val status = uiState.connectionStatus) {
                    is ConnectionTestStatus.Idle -> {}
                    is ConnectionTestStatus.Testing -> {
                        HudBadge(
                            text = "TESTING CONNECTION...",
                            variant = HudBadgeVariant.INFO
                        )
                    }
                    is ConnectionTestStatus.Success -> {
                        HudBadge(
                            text = "CONNECTION SUCCESSFUL",
                            variant = HudBadgeVariant.SUCCESS
                        )
                    }
                    is ConnectionTestStatus.Error -> {
                        HudBadge(
                            text = "CONNECTION FAILED",
                            variant = HudBadgeVariant.ERROR
                        )
                    }
                }

                // Error message
                if (uiState.errorMessage != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = uiState.errorMessage!!,
                        color = HudAccent,
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Connect button
                HudTextButton(
                    onClick = { viewModel.testConnection(onConnected) },
                    text = if (uiState.isLoading) "CONNECTING..." else "CONNECT",
                    enabled = !uiState.isLoading &&
                        uiState.gatewayUrl.isNotBlank() &&
                        uiState.apiToken.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = if (uiState.isLoading) {
                        { HudSpinner(size = 20.dp) }
                    } else null
                )

                Spacer(modifier = Modifier.height(48.dp))

                // Version info
                Text(
                    text = "v1.0.0",
                    color = HudGray,
                    fontSize = 10.sp,
                    letterSpacing = 1.sp
                )
            }
        }
    }
}

@Composable
private fun ApertureLogo(
    modifier: Modifier = Modifier,
    isConnecting: Boolean = false
) {
    val infiniteTransition = rememberInfiniteTransition(label = "logo")

    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = if (isConnecting) 2000 else 20000,
                easing = LinearEasing
            ),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    Canvas(
        modifier = modifier.rotate(rotation)
    ) {
        val center = Offset(size.width / 2, size.height / 2)
        val outerRadius = size.minDimension / 2 - 4f
        val innerRadius = outerRadius * 0.6f

        // Outer ring
        drawCircle(
            color = HudAccent,
            radius = outerRadius,
            center = center,
            style = Stroke(width = 3f)
        )

        // Inner ring
        drawCircle(
            color = HudGray,
            radius = innerRadius,
            center = center,
            style = Stroke(width = 2f)
        )

        // Aperture blades (6 segments)
        val bladeCount = 6
        for (i in 0 until bladeCount) {
            val angle = (i * 360f / bladeCount) * (Math.PI / 180f).toFloat()
            val startRadius = innerRadius + 4f
            val endRadius = outerRadius - 4f

            val startX = center.x + kotlin.math.cos(angle) * startRadius
            val startY = center.y + kotlin.math.sin(angle) * startRadius
            val endX = center.x + kotlin.math.cos(angle) * endRadius
            val endY = center.y + kotlin.math.sin(angle) * endRadius

            drawLine(
                color = HudAccent,
                start = Offset(startX, startY),
                end = Offset(endX, endY),
                strokeWidth = 2f,
                cap = StrokeCap.Round
            )
        }

        // Center dot
        drawCircle(
            color = if (isConnecting) HudSuccess else HudAccent,
            radius = 6f,
            center = center
        )
    }
}
