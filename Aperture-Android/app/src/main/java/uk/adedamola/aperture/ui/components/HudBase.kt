package uk.adedamola.aperture.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudGray

/**
 * Corner bracket decorator for HUD panels.
 * Draws L-shaped brackets at all four corners.
 *
 * @param color The color of the bracket lines (default: HudAccent orange-red)
 * @param bracketLength Length of each arm of the L-bracket
 * @param strokeWidth Thickness of the bracket lines
 * @param inset Distance from the edge to start drawing (0 = at edge)
 */
@Composable
fun Modifier.hudCornerBrackets(
    color: Color = HudAccent,
    bracketLength: Dp = 16.dp,
    strokeWidth: Dp = 2.dp,
    inset: Dp = 0.dp
): Modifier = this.drawBehind {
    val length = bracketLength.toPx()
    val stroke = strokeWidth.toPx()
    val offset = inset.toPx()

    // Top-left corner
    drawLine(
        color = color,
        start = Offset(offset, offset + stroke / 2),
        end = Offset(offset + length, offset + stroke / 2),
        strokeWidth = stroke
    )
    drawLine(
        color = color,
        start = Offset(offset + stroke / 2, offset),
        end = Offset(offset + stroke / 2, offset + length),
        strokeWidth = stroke
    )

    // Top-right corner
    drawLine(
        color = color,
        start = Offset(size.width - offset - length, offset + stroke / 2),
        end = Offset(size.width - offset, offset + stroke / 2),
        strokeWidth = stroke
    )
    drawLine(
        color = color,
        start = Offset(size.width - offset - stroke / 2, offset),
        end = Offset(size.width - offset - stroke / 2, offset + length),
        strokeWidth = stroke
    )

    // Bottom-left corner
    drawLine(
        color = color,
        start = Offset(offset, size.height - offset - stroke / 2),
        end = Offset(offset + length, size.height - offset - stroke / 2),
        strokeWidth = stroke
    )
    drawLine(
        color = color,
        start = Offset(offset + stroke / 2, size.height - offset - length),
        end = Offset(offset + stroke / 2, size.height - offset),
        strokeWidth = stroke
    )

    // Bottom-right corner
    drawLine(
        color = color,
        start = Offset(size.width - offset - length, size.height - offset - stroke / 2),
        end = Offset(size.width - offset, size.height - offset - stroke / 2),
        strokeWidth = stroke
    )
    drawLine(
        color = color,
        start = Offset(size.width - offset - stroke / 2, size.height - offset - length),
        end = Offset(size.width - offset - stroke / 2, size.height - offset),
        strokeWidth = stroke
    )
}

/**
 * Standalone corner brackets composable overlay.
 * Use this when you need corner brackets as a separate layer.
 */
@Composable
fun HudCornerBrackets(
    modifier: Modifier = Modifier,
    color: Color = HudAccent,
    bracketLength: Dp = 16.dp,
    strokeWidth: Dp = 2.dp
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val length = bracketLength.toPx()
        val stroke = strokeWidth.toPx()

        // Top-left corner
        drawLine(color, Offset(0f, stroke / 2), Offset(length, stroke / 2), stroke)
        drawLine(color, Offset(stroke / 2, 0f), Offset(stroke / 2, length), stroke)

        // Top-right corner
        drawLine(color, Offset(size.width - length, stroke / 2), Offset(size.width, stroke / 2), stroke)
        drawLine(color, Offset(size.width - stroke / 2, 0f), Offset(size.width - stroke / 2, length), stroke)

        // Bottom-left corner
        drawLine(color, Offset(0f, size.height - stroke / 2), Offset(length, size.height - stroke / 2), stroke)
        drawLine(color, Offset(stroke / 2, size.height - length), Offset(stroke / 2, size.height), stroke)

        // Bottom-right corner
        drawLine(color, Offset(size.width - length, size.height - stroke / 2), Offset(size.width, size.height - stroke / 2), stroke)
        drawLine(color, Offset(size.width - stroke / 2, size.height - length), Offset(size.width - stroke / 2, size.height), stroke)
    }
}

/**
 * Grid pattern overlay for HUD background.
 */
@Composable
fun HudGridOverlay(
    modifier: Modifier = Modifier,
    gridColor: Color = HudGray.copy(alpha = 0.3f),
    gridSpacing: Dp = 20.dp
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val spacing = gridSpacing.toPx()

        // Vertical lines
        var x = 0f
        while (x <= size.width) {
            drawLine(
                color = gridColor,
                start = Offset(x, 0f),
                end = Offset(x, size.height),
                strokeWidth = 1f
            )
            x += spacing
        }

        // Horizontal lines
        var y = 0f
        while (y <= size.height) {
            drawLine(
                color = gridColor,
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 1f
            )
            y += spacing
        }
    }
}

/**
 * Scanline effect overlay for CRT-style appearance.
 */
@Composable
fun HudScanlineOverlay(
    modifier: Modifier = Modifier,
    lineColor: Color = Color.Black.copy(alpha = 0.1f),
    lineSpacing: Dp = 2.dp
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        val spacing = lineSpacing.toPx()
        var y = 0f
        while (y <= size.height) {
            drawLine(
                color = lineColor,
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 1f
            )
            y += spacing * 2
        }
    }
}

/**
 * Animated pulse glow effect.
 */
@Composable
fun pulseAlpha(): Float {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )
    return alpha
}

/**
 * HUD-styled card container with corner brackets and border.
 */
@Composable
fun HudCard(
    modifier: Modifier = Modifier,
    borderColor: Color = HudGray,
    backgroundColor: Color = HudDark,
    showCornerBrackets: Boolean = true,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier
            .background(backgroundColor)
            .border(1.dp, borderColor)
            .then(
                if (showCornerBrackets) {
                    Modifier.hudCornerBrackets()
                } else {
                    Modifier
                }
            )
            .padding(16.dp),
        content = content
    )
}

/**
 * Status dot indicator with optional pulse animation.
 */
@Composable
fun HudStatusDot(
    modifier: Modifier = Modifier,
    color: Color = HudAccent,
    size: Dp = 8.dp,
    animated: Boolean = false
) {
    val alpha = if (animated) pulseAlpha() else 1f

    Canvas(modifier = modifier) {
        val radius = size.toPx() / 2

        // Glow effect
        if (animated) {
            drawCircle(
                color = color.copy(alpha = alpha * 0.3f),
                radius = radius * 1.5f
            )
        }

        // Main dot
        drawCircle(
            color = color.copy(alpha = alpha),
            radius = radius
        )
    }
}
