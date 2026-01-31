package uk.adedamola.aperture.presentation.screen.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.adedamola.aperture.ui.components.HudAccordion
import uk.adedamola.aperture.ui.components.HudBadge
import uk.adedamola.aperture.ui.components.HudBadgeVariant
import uk.adedamola.aperture.ui.components.HudButtonVariant
import uk.adedamola.aperture.ui.components.HudTextButton
import uk.adedamola.aperture.ui.components.HudCard
import uk.adedamola.aperture.ui.components.HudConfirmDialog
import uk.adedamola.aperture.ui.components.layout.HudShell
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudSuccess
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onDisconnect: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showClearDataDialog by remember { mutableStateOf(false) }
    var showDisconnectDialog by remember { mutableStateOf(false) }

    HudShell(
        title = "Settings",
        currentRoute = "settings",
        onNavigate = onNavigate,
        onBackClick = onBack,
        isConnected = uiState.isConnected
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Gateway Connection
            HudAccordion(
                title = "Gateway Connection",
                icon = Icons.Default.Link,
                initiallyExpanded = true
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "Status:",
                            color = HudText,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        HudBadge(
                            text = if (uiState.isConnected) "CONNECTED" else "DISCONNECTED",
                            variant = if (uiState.isConnected) HudBadgeVariant.SUCCESS else HudBadgeVariant.ERROR
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "URL: ${uiState.gatewayUrl ?: "Not configured"}",
                        color = HudText,
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    HudTextButton(
                        onClick = { showDisconnectDialog = true },
                        text = "Disconnect",
                        variant = HudButtonVariant.OUTLINE,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.CloudOff,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    )
                }
            }

            // Appearance
            HudAccordion(
                title = "Appearance",
                icon = Icons.Default.Palette
            ) {
                Column {
                    Text(
                        text = "Theme: Dark Mode (HUD)",
                        color = HudText,
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "The HUD theme is optimized for the cyberpunk aesthetic.",
                        color = HudGray,
                        fontSize = 11.sp
                    )
                }
            }

            // Keyboard Shortcuts
            HudAccordion(
                title = "Keyboard Shortcuts",
                icon = Icons.Default.Keyboard
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShortcutRow("Send message", "Ctrl + Enter")
                    ShortcutRow("New line", "Shift + Enter")
                    ShortcutRow("Cancel prompt", "Escape")
                    ShortcutRow("Focus input", "Tab")
                }
            }

            // Data Management
            HudAccordion(
                title = "Data Management",
                icon = Icons.Default.DeleteForever
            ) {
                Column {
                    Text(
                        text = "Clear all local data including cached sessions, messages, and preferences.",
                        color = HudText,
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    HudTextButton(
                        onClick = { showClearDataDialog = true },
                        text = "Clear All Data",
                        variant = HudButtonVariant.OUTLINE,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.DeleteForever,
                                contentDescription = null,
                                tint = HudAccent,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    )
                }
            }

            // About
            HudAccordion(
                title = "About",
                icon = Icons.Default.Info
            ) {
                Column {
                    InfoRow("App Version", "1.0.0")
                    InfoRow("Build", "Release")
                    InfoRow("Platform", "Android")

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = "Aperture Gateway Control Interface",
                        color = HudGray,
                        fontSize = 11.sp
                    )
                }
            }
        }

        // Clear data confirmation
        if (showClearDataDialog) {
            HudConfirmDialog(
                onDismiss = { showClearDataDialog = false },
                onConfirm = {
                    viewModel.clearAllData()
                    showClearDataDialog = false
                    onDisconnect()
                },
                title = "Clear All Data",
                message = "This will delete all local data including settings, cached sessions, and messages. You will need to reconnect to the gateway.",
                confirmText = "Clear Data",
                isDangerous = true
            )
        }

        // Disconnect confirmation
        if (showDisconnectDialog) {
            HudConfirmDialog(
                onDismiss = { showDisconnectDialog = false },
                onConfirm = {
                    viewModel.disconnect()
                    showDisconnectDialog = false
                    onDisconnect()
                },
                title = "Disconnect",
                message = "Are you sure you want to disconnect from the gateway?",
                confirmText = "Disconnect"
            )
        }
    }
}

@Composable
private fun ShortcutRow(action: String, shortcut: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = action,
            color = HudText,
            fontSize = 12.sp
        )
        HudBadge(
            text = shortcut,
            variant = HudBadgeVariant.DEFAULT
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            color = HudText,
            fontSize = 12.sp
        )
        Text(
            text = value,
            color = HudWhite,
            fontSize = 12.sp
        )
    }
}
