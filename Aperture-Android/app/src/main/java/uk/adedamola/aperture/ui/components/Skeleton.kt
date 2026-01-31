package uk.adedamola.aperture.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudGray

@Composable
fun HudSkeleton(
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp = 16.dp
) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val shimmerProgress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    val brush = Brush.linearGradient(
        colors = listOf(
            HudDark,
            HudGray.copy(alpha = 0.3f),
            HudDark
        ),
        start = Offset(shimmerProgress * 1000f - 500f, 0f),
        end = Offset(shimmerProgress * 1000f, 0f)
    )

    Box(
        modifier = modifier
            .then(
                if (width != null) Modifier.width(width) else Modifier.fillMaxWidth()
            )
            .height(height)
            .background(brush)
    )
}

@Composable
fun HudSkeletonText(
    lines: Int = 3,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        repeat(lines) { index ->
            HudSkeleton(
                height = 14.dp,
                modifier = Modifier.fillMaxWidth(
                    if (index == lines - 1) 0.6f else 1f
                )
            )
        }
    }
}

@Composable
fun HudSkeletonCard(
    modifier: Modifier = Modifier
) {
    HudCard(modifier = modifier) {
        Column {
            // Header
            Row {
                HudSkeleton(
                    width = 40.dp,
                    height = 40.dp
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    HudSkeleton(
                        width = 120.dp,
                        height = 14.dp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    HudSkeleton(
                        width = 80.dp,
                        height = 12.dp
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Content
            HudSkeletonText(lines = 2)
        }
    }
}

@Composable
fun HudSkeletonList(
    itemCount: Int = 3,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        repeat(itemCount) {
            HudSkeletonCard()
        }
    }
}

@Composable
fun HudSkeletonMessage(
    isUser: Boolean = false,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(if (isUser) 0.7f else 0.85f)
        ) {
            // Avatar and name
            Row {
                HudSkeleton(
                    width = 24.dp,
                    height = 24.dp
                )
                Spacer(modifier = Modifier.width(8.dp))
                HudSkeleton(
                    width = 80.dp,
                    height = 14.dp
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Message content
            HudSkeletonText(lines = if (isUser) 1 else 3)
        }
    }
}
