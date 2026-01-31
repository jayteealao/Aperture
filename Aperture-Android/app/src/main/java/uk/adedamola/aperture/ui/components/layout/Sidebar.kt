package uk.adedamola.aperture.ui.components.layout

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Help
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.adedamola.aperture.ui.components.HudStatusDot
import uk.adedamola.aperture.ui.components.hudCornerBrackets
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudBlack
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudSuccess
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

sealed class SidebarItem(
    val route: String,
    val label: String,
    val icon: ImageVector
) {
    data object Sessions : SidebarItem("sessions", "Sessions", Icons.Default.Message)
    data object Workspaces : SidebarItem("workspaces", "Workspaces", Icons.Default.Folder)
    data object Credentials : SidebarItem("credentials", "Credentials", Icons.Default.Key)
    data object Settings : SidebarItem("settings", "Settings", Icons.Default.Settings)
    data object Help : SidebarItem("help", "Help", Icons.Default.Help)
}

@Composable
fun HudSidebar(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    modifier: Modifier = Modifier,
    isConnected: Boolean = false,
    width: Dp = 220.dp,
    header: @Composable (() -> Unit)? = null
) {
    Column(
        modifier = modifier
            .width(width)
            .fillMaxHeight()
            .background(HudBlack)
            .border(width = 1.dp, color = HudGray)
    ) {
        // Header / Logo
        if (header != null) {
            header()
        } else {
            DefaultSidebarHeader(isConnected = isConnected)
        }

        // Navigation items
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(8.dp)
        ) {
            SidebarNavItem(
                item = SidebarItem.Sessions,
                isSelected = currentRoute == SidebarItem.Sessions.route,
                onClick = { onNavigate(SidebarItem.Sessions.route) }
            )

            Spacer(modifier = Modifier.height(4.dp))

            SidebarNavItem(
                item = SidebarItem.Workspaces,
                isSelected = currentRoute == SidebarItem.Workspaces.route,
                onClick = { onNavigate(SidebarItem.Workspaces.route) }
            )

            Spacer(modifier = Modifier.height(4.dp))

            SidebarNavItem(
                item = SidebarItem.Credentials,
                isSelected = currentRoute == SidebarItem.Credentials.route,
                onClick = { onNavigate(SidebarItem.Credentials.route) }
            )

            Spacer(modifier = Modifier.weight(1f))

            // Bottom items
            SidebarNavItem(
                item = SidebarItem.Settings,
                isSelected = currentRoute == SidebarItem.Settings.route,
                onClick = { onNavigate(SidebarItem.Settings.route) }
            )

            Spacer(modifier = Modifier.height(4.dp))

            SidebarNavItem(
                item = SidebarItem.Help,
                isSelected = currentRoute == SidebarItem.Help.route,
                onClick = { onNavigate(SidebarItem.Help.route) }
            )
        }
    }
}

@Composable
private fun DefaultSidebarHeader(
    isConnected: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Aperture logo
        Box(
            modifier = Modifier
                .size(32.dp)
                .background(HudAccent)
                .hudCornerBrackets(
                    color = HudWhite,
                    bracketLength = 8.dp,
                    strokeWidth = 1.dp
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "A",
                color = HudWhite,
                fontSize = 18.sp
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "APERTURE",
                color = HudWhite,
                fontSize = 14.sp,
                letterSpacing = 2.sp
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                HudStatusDot(
                    color = if (isConnected) HudSuccess else HudGray,
                    size = 6.dp,
                    animated = isConnected
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (isConnected) "CONNECTED" else "OFFLINE",
                    color = HudText,
                    fontSize = 10.sp,
                    letterSpacing = 1.sp
                )
            }
        }
    }

    // Divider
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(HudGray)
    )
}

@Composable
private fun SidebarNavItem(
    item: SidebarItem,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val backgroundColor = if (isSelected) HudDark else Color.Transparent
    val textColor = if (isSelected) HudWhite else HudText
    val iconColor = if (isSelected) HudAccent else HudText

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(backgroundColor)
            .then(
                if (isSelected) {
                    Modifier
                        .border(1.dp, HudGray)
                        .hudCornerBrackets(
                            color = HudAccent,
                            bracketLength = 6.dp,
                            strokeWidth = 1.dp
                        )
                } else {
                    Modifier
                }
            )
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = item.icon,
            contentDescription = item.label,
            tint = iconColor,
            modifier = Modifier.size(20.dp)
        )

        Spacer(modifier = Modifier.width(12.dp))

        Text(
            text = item.label.uppercase(),
            color = textColor,
            fontSize = 12.sp,
            letterSpacing = 1.sp
        )
    }
}

/**
 * Modal drawer overlay for mobile
 */
@Composable
fun HudModalSidebar(
    isVisible: Boolean,
    onDismiss: () -> Unit,
    currentRoute: String,
    onNavigate: (String) -> Unit,
    isConnected: Boolean = false
) {
    if (isVisible) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable(onClick = onDismiss)
        ) {
            AnimatedVisibility(
                visible = isVisible,
                enter = slideInHorizontally { -it },
                exit = slideOutHorizontally { -it }
            ) {
                HudSidebar(
                    currentRoute = currentRoute,
                    onNavigate = {
                        onNavigate(it)
                        onDismiss()
                    },
                    isConnected = isConnected,
                    modifier = Modifier.clickable(enabled = false) {} // Prevent dismiss on sidebar click
                )
            }
        }
    }
}
