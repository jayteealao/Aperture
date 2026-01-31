package uk.adedamola.aperture.ui.components.layout

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import uk.adedamola.aperture.ui.components.HudGridOverlay
import uk.adedamola.aperture.ui.components.HudScanlineOverlay
import uk.adedamola.aperture.ui.components.HudToastHost
import uk.adedamola.aperture.ui.components.ToastHostState
import uk.adedamola.aperture.ui.components.rememberToastHostState
import uk.adedamola.aperture.ui.theme.HudBlack

/**
 * Main application shell with HUD styling.
 * Provides responsive layout with sidebar on larger screens
 * and bottom navigation/drawer on mobile.
 */
@Composable
fun HudShell(
    title: String,
    currentRoute: String,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    isConnected: Boolean = false,
    showGridOverlay: Boolean = true,
    showScanlines: Boolean = false,
    onBackClick: (() -> Unit)? = null,
    topBarActions: @Composable (() -> Unit)? = null,
    rightPanel: @Composable (() -> Unit)? = null,
    toastHostState: ToastHostState = rememberToastHostState(),
    content: @Composable () -> Unit
) {
    val configuration = LocalConfiguration.current
    val isWideScreen = configuration.screenWidthDp >= 600

    var sidebarVisible by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(HudBlack)
    ) {
        // Grid overlay
        if (showGridOverlay) {
            HudGridOverlay()
        }

        // Scanlines
        if (showScanlines) {
            HudScanlineOverlay()
        }

        // Main layout
        Row(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
        ) {
            // Sidebar (permanent on wide screens)
            if (isWideScreen) {
                HudSidebar(
                    currentRoute = currentRoute,
                    onNavigate = onNavigate,
                    isConnected = isConnected
                )
            }

            // Main content area
            Column(modifier = Modifier.weight(1f)) {
                // Top bar
                HudTopbar(
                    title = title,
                    subtitle = subtitle,
                    onMenuClick = if (!isWideScreen) {
                        { sidebarVisible = true }
                    } else null,
                    onBackClick = onBackClick,
                    actions = topBarActions
                )

                // Content with optional right panel
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    // Main content
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .padding(16.dp)
                    ) {
                        content()
                    }

                    // Right panel (SDK control panel, etc.)
                    if (rightPanel != null && isWideScreen) {
                        Box(modifier = Modifier.fillMaxWidth(0.3f)) {
                            rightPanel()
                        }
                    }
                }
            }
        }

        // Modal sidebar for mobile
        if (!isWideScreen) {
            HudModalSidebar(
                isVisible = sidebarVisible,
                onDismiss = { sidebarVisible = false },
                currentRoute = currentRoute,
                onNavigate = onNavigate,
                isConnected = isConnected
            )
        }

        // Toast notifications
        HudToastHost(
            state = toastHostState,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 64.dp)
        )
    }
}

/**
 * Simple shell without sidebar navigation.
 * Used for standalone screens like Onboarding.
 */
@Composable
fun HudSimpleShell(
    modifier: Modifier = Modifier,
    showGridOverlay: Boolean = true,
    showScanlines: Boolean = false,
    toastHostState: ToastHostState = rememberToastHostState(),
    content: @Composable () -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(HudBlack)
    ) {
        // Grid overlay
        if (showGridOverlay) {
            HudGridOverlay()
        }

        // Scanlines
        if (showScanlines) {
            HudScanlineOverlay()
        }

        // Content
        Box(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.statusBars)
        ) {
            content()
        }

        // Toast notifications
        HudToastHost(
            state = toastHostState,
            modifier = Modifier.fillMaxWidth()
        )
    }
}
