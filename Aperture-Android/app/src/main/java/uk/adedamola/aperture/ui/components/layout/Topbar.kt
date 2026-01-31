package uk.adedamola.aperture.ui.components.layout

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudBlack
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun HudTopbar(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onMenuClick: (() -> Unit)? = null,
    onBackClick: (() -> Unit)? = null,
    actions: @Composable (() -> Unit)? = null
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(HudBlack)
            .border(width = 1.dp, color = HudGray)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Navigation icon
        when {
            onBackClick != null -> {
                IconButton(onClick = onBackClick) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = HudText,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
            onMenuClick != null -> {
                IconButton(onClick = onMenuClick) {
                    Icon(
                        imageVector = Icons.Default.Menu,
                        contentDescription = "Menu",
                        tint = HudText,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
            else -> {
                Spacer(modifier = Modifier.width(8.dp))
            }
        }

        // Aperture logo indicator
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(HudAccent)
        )

        Spacer(modifier = Modifier.width(12.dp))

        // Title and subtitle
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title.uppercase(),
                color = HudWhite,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp
            )

            if (subtitle != null) {
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "//",
                    color = HudGray,
                    fontSize = 14.sp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = subtitle,
                    color = HudText,
                    fontSize = 12.sp
                )
            }
        }

        // Actions
        actions?.invoke()
    }
}

@Composable
fun HudTopbarAction(
    icon: ImageVector,
    onClick: () -> Unit,
    contentDescription: String? = null,
    enabled: Boolean = true
) {
    IconButton(
        onClick = onClick,
        enabled = enabled
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (enabled) HudText else HudText.copy(alpha = 0.5f),
            modifier = Modifier.size(24.dp)
        )
    }
}
