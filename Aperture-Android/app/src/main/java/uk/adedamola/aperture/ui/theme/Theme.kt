package uk.adedamola.aperture.ui.theme

import android.app.Activity
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

private val ApertureColorScheme = darkColorScheme(
    // Primary
    primary = HudAccent,
    onPrimary = HudWhiteBright,
    primaryContainer = HudAccentDark,
    onPrimaryContainer = HudWhite,

    // Secondary
    secondary = HudGrayLight,
    onSecondary = HudWhite,
    secondaryContainer = HudGray,
    onSecondaryContainer = HudWhite,

    // Tertiary
    tertiary = HudInfo,
    onTertiary = HudBlack,
    tertiaryContainer = HudInfo,
    onTertiaryContainer = HudBlack,

    // Error
    error = HudError,
    onError = HudWhiteBright,
    errorContainer = HudError,
    onErrorContainer = HudWhiteBright,

    // Background
    background = HudBlack,
    onBackground = HudWhite,

    // Surface
    surface = HudDark,
    onSurface = HudWhite,
    surfaceVariant = HudDarker,
    onSurfaceVariant = HudText,

    // Outline
    outline = HudGray,
    outlineVariant = HudGrayLight,

    // Inverse
    inverseSurface = HudWhite,
    inverseOnSurface = HudBlack,
    inversePrimary = HudAccentDark,

    // Scrim
    scrim = HudBlack
)

// Sharp-edged shapes for HUD aesthetic - no rounded corners by default
private val ApertureShapes = Shapes(
    extraSmall = RoundedCornerShape(0.dp),
    small = RoundedCornerShape(0.dp),
    medium = RoundedCornerShape(0.dp),
    large = RoundedCornerShape(0.dp),
    extraLarge = RoundedCornerShape(0.dp)
)

@Composable
fun ApertureTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = HudBlack.toArgb()
            window.navigationBarColor = HudBlack.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = ApertureColorScheme,
        typography = ApertureTypography,
        shapes = ApertureShapes,
        content = content
    )
}
