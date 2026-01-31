package uk.adedamola.aperture.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudAccentDark
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudWhite
import uk.adedamola.aperture.ui.theme.HudWhiteBright

enum class HudButtonVariant {
    PRIMARY,
    SECONDARY,
    OUTLINE,
    GHOST
}

@Composable
fun HudButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: HudButtonVariant = HudButtonVariant.PRIMARY,
    enabled: Boolean = true,
    content: @Composable () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val (backgroundColor, borderColor, contentColor) = when (variant) {
        HudButtonVariant.PRIMARY -> Triple(
            if (isPressed) HudAccentDark else HudAccent,
            HudAccent,
            HudWhiteBright
        )
        HudButtonVariant.SECONDARY -> Triple(
            if (isPressed) HudGray else HudDark,
            HudGray,
            HudWhite
        )
        HudButtonVariant.OUTLINE -> Triple(
            if (isPressed) HudGray.copy(alpha = 0.2f) else Color.Transparent,
            HudAccent,
            HudAccent
        )
        HudButtonVariant.GHOST -> Triple(
            if (isPressed) HudGray.copy(alpha = 0.1f) else Color.Transparent,
            Color.Transparent,
            HudWhite
        )
    }

    Box(
        modifier = modifier
            .alpha(if (enabled) 1f else 0.5f)
            .background(backgroundColor)
            .border(1.dp, borderColor)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}

@Composable
fun HudTextButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: HudButtonVariant = HudButtonVariant.PRIMARY,
    enabled: Boolean = true,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null
) {
    HudButton(
        onClick = onClick,
        modifier = modifier,
        variant = variant,
        enabled = enabled
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            leadingIcon?.invoke()
            Text(
                text = text.uppercase(),
                style = MaterialTheme.typography.titleSmall
            )
            trailingIcon?.invoke()
        }
    }
}
