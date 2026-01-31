package uk.adedamola.aperture.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudError
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudInfo
import uk.adedamola.aperture.ui.theme.HudSuccess
import uk.adedamola.aperture.ui.theme.HudWarning
import uk.adedamola.aperture.ui.theme.HudWhite

enum class HudBadgeVariant {
    DEFAULT,
    SUCCESS,
    WARNING,
    ERROR,
    INFO
}

@Composable
fun HudBadge(
    text: String,
    modifier: Modifier = Modifier,
    variant: HudBadgeVariant = HudBadgeVariant.DEFAULT,
    showDot: Boolean = false,
    animated: Boolean = false
) {
    val (backgroundColor, borderColor, dotColor) = when (variant) {
        HudBadgeVariant.DEFAULT -> Triple(
            HudGray.copy(alpha = 0.3f),
            HudGray,
            HudAccent
        )
        HudBadgeVariant.SUCCESS -> Triple(
            HudSuccess.copy(alpha = 0.1f),
            HudSuccess.copy(alpha = 0.5f),
            HudSuccess
        )
        HudBadgeVariant.WARNING -> Triple(
            HudWarning.copy(alpha = 0.1f),
            HudWarning.copy(alpha = 0.5f),
            HudWarning
        )
        HudBadgeVariant.ERROR -> Triple(
            HudError.copy(alpha = 0.1f),
            HudError.copy(alpha = 0.5f),
            HudError
        )
        HudBadgeVariant.INFO -> Triple(
            HudInfo.copy(alpha = 0.1f),
            HudInfo.copy(alpha = 0.5f),
            HudInfo
        )
    }

    Row(
        modifier = modifier
            .background(backgroundColor)
            .border(1.dp, borderColor)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (showDot) {
            HudStatusDot(
                modifier = Modifier.size(6.dp),
                color = dotColor,
                size = 6.dp,
                animated = animated
            )
        }
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = HudWhite
        )
    }
}

@Composable
fun HudStatusBadge(
    status: String,
    modifier: Modifier = Modifier,
    isOnline: Boolean = false
) {
    HudBadge(
        text = status,
        modifier = modifier,
        variant = if (isOnline) HudBadgeVariant.SUCCESS else HudBadgeVariant.ERROR,
        showDot = true,
        animated = isOnline
    )
}
