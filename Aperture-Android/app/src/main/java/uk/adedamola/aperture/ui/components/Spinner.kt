package uk.adedamola.aperture.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudGray
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * HUD-style spinning loader.
 */
@Composable
fun HudSpinner(
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
    color: Color = HudAccent,
    trackColor: Color = HudGray.copy(alpha = 0.3f),
    strokeWidth: Dp = 3.dp
) {
    val infiniteTransition = rememberInfiniteTransition(label = "spinner")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing)
        ),
        label = "rotation"
    )

    Canvas(modifier = modifier.size(size)) {
        val strokePx = strokeWidth.toPx()
        val radius = (this.size.minDimension - strokePx) / 2

        // Background track
        drawCircle(
            color = trackColor,
            radius = radius,
            style = Stroke(width = strokePx)
        )

        // Spinning arc
        rotate(rotation) {
            drawArc(
                color = color,
                startAngle = 0f,
                sweepAngle = 90f,
                useCenter = false,
                style = Stroke(width = strokePx, cap = StrokeCap.Round)
            )
        }
    }
}

/**
 * HUD-style dot loader with sequential animation.
 */
@Composable
fun HudDotLoader(
    modifier: Modifier = Modifier,
    dotCount: Int = 3,
    dotSize: Dp = 6.dp,
    dotSpacing: Dp = 8.dp,
    color: Color = HudAccent
) {
    val infiniteTransition = rememberInfiniteTransition(label = "dotLoader")
    val progress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = dotCount.toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(600 * dotCount, easing = LinearEasing)
        ),
        label = "dotProgress"
    )

    Canvas(
        modifier = modifier.size(
            width = (dotSize.value * dotCount + dotSpacing.value * (dotCount - 1)).dp,
            height = dotSize
        )
    ) {
        val dotRadius = dotSize.toPx() / 2
        val spacing = dotSpacing.toPx()

        repeat(dotCount) { index ->
            val x = dotRadius + index * (dotRadius * 2 + spacing)
            val y = center.y

            // Calculate alpha based on animation progress
            val distanceFromActive = kotlin.math.abs(progress - index)
            val alpha = (1f - (distanceFromActive / dotCount).coerceIn(0f, 1f)) * 0.7f + 0.3f

            drawCircle(
                color = color.copy(alpha = alpha),
                radius = dotRadius,
                center = Offset(x, y)
            )
        }
    }
}

/**
 * HUD-style radar sweep animation.
 */
@Composable
fun HudRadarSweep(
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    color: Color = HudAccent,
    ringColor: Color = HudGray.copy(alpha = 0.3f)
) {
    val infiniteTransition = rememberInfiniteTransition(label = "radar")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing)
        ),
        label = "radarRotation"
    )

    Canvas(modifier = modifier.size(size)) {
        val centerX = this.size.width / 2
        val centerY = this.size.height / 2
        val radius = this.size.minDimension / 2 - 2.dp.toPx()

        // Concentric rings
        listOf(0.33f, 0.66f, 1f).forEach { scale ->
            drawCircle(
                color = ringColor,
                radius = radius * scale,
                style = Stroke(width = 1.dp.toPx())
            )
        }

        // Cross hairs
        drawLine(
            color = ringColor,
            start = Offset(centerX, 0f),
            end = Offset(centerX, this.size.height),
            strokeWidth = 1.dp.toPx()
        )
        drawLine(
            color = ringColor,
            start = Offset(0f, centerY),
            end = Offset(this.size.width, centerY),
            strokeWidth = 1.dp.toPx()
        )

        // Sweep line
        rotate(rotation, pivot = Offset(centerX, centerY)) {
            drawLine(
                color = color,
                start = Offset(centerX, centerY),
                end = Offset(centerX, centerY - radius),
                strokeWidth = 2.dp.toPx(),
                cap = StrokeCap.Round
            )
        }

        // Center dot
        drawCircle(
            color = color,
            radius = 3.dp.toPx(),
            center = Offset(centerX, centerY)
        )
    }
}
