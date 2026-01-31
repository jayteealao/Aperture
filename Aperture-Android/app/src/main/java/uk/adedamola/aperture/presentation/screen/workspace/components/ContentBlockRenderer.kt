package uk.adedamola.aperture.presentation.screen.workspace.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import kotlinx.serialization.json.JsonElement
import uk.adedamola.aperture.domain.model.ContentBlock
import uk.adedamola.aperture.ui.components.hudCornerBrackets
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudBlack
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudError
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudInfo
import uk.adedamola.aperture.ui.theme.HudSuccess
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun ContentBlockRenderer(
    block: ContentBlock,
    modifier: Modifier = Modifier
) {
    when (block) {
        is ContentBlock.Text -> TextBlock(text = block.text, modifier = modifier)
        is ContentBlock.Thinking -> ThinkingBlock(
            thinking = block.thinking,
            modifier = modifier
        )
        is ContentBlock.ToolUse -> ToolUseBlock(
            name = block.name,
            input = block.input,
            modifier = modifier
        )
        is ContentBlock.ToolResult -> ToolResultBlock(
            content = block.content,
            isError = block.isError,
            modifier = modifier
        )
        is ContentBlock.Image -> ImageBlock(
            data = block.data,
            mimeType = block.mimeType,
            filename = block.filename,
            modifier = modifier
        )
    }
}

@Composable
private fun TextBlock(
    text: String,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        color = HudWhite,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        modifier = modifier
    )
}

@Composable
private fun ThinkingBlock(
    thinking: String,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(HudDark)
            .border(1.dp, HudInfo.copy(alpha = 0.3f))
            .hudCornerBrackets(
                color = HudInfo,
                bracketLength = 6.dp,
                strokeWidth = 1.dp
            )
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Psychology,
                contentDescription = null,
                tint = HudInfo,
                modifier = Modifier.size(18.dp)
            )

            Spacer(modifier = Modifier.width(8.dp))

            Text(
                text = "THINKING",
                color = HudInfo,
                fontSize = 11.sp,
                letterSpacing = 1.sp,
                modifier = Modifier.weight(1f)
            )

            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = HudText,
                modifier = Modifier.size(18.dp)
            )
        }

        // Content
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            Column {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(HudGray.copy(alpha = 0.3f))
                )

                Text(
                    text = thinking,
                    color = HudText,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }
    }
}

@Composable
private fun ToolUseBlock(
    name: String,
    input: JsonElement?,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(HudDark)
            .border(1.dp, HudAccent.copy(alpha = 0.3f))
            .hudCornerBrackets(
                color = HudAccent,
                bracketLength = 6.dp,
                strokeWidth = 1.dp
            )
    ) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Build,
                contentDescription = null,
                tint = HudAccent,
                modifier = Modifier.size(18.dp)
            )

            Spacer(modifier = Modifier.width(8.dp))

            Text(
                text = name.uppercase(),
                color = HudAccent,
                fontSize = 11.sp,
                letterSpacing = 1.sp,
                modifier = Modifier.weight(1f)
            )

            Icon(
                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = HudText,
                modifier = Modifier.size(18.dp)
            )
        }

        // Input JSON
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically()
        ) {
            Column {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(HudGray.copy(alpha = 0.3f))
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(12.dp)
                ) {
                    Text(
                        text = input?.toString() ?: "{}",
                        color = HudText,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

@Composable
private fun ToolResultBlock(
    content: String,
    isError: Boolean,
    modifier: Modifier = Modifier
) {
    val borderColor = if (isError) HudError else HudSuccess

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(HudDark)
            .border(1.dp, borderColor.copy(alpha = 0.3f))
            .hudCornerBrackets(
                color = borderColor,
                bracketLength = 6.dp,
                strokeWidth = 1.dp
            )
            .padding(12.dp)
    ) {
        // Header
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = if (isError) Icons.Default.Close else Icons.Default.Check,
                contentDescription = null,
                tint = borderColor,
                modifier = Modifier.size(16.dp)
            )

            Spacer(modifier = Modifier.width(8.dp))

            Text(
                text = if (isError) "ERROR" else "RESULT",
                color = borderColor,
                fontSize = 10.sp,
                letterSpacing = 1.sp
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Content
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
        ) {
            Text(
                text = content,
                color = if (isError) HudError else HudText,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
private fun ImageBlock(
    data: String,
    mimeType: String,
    filename: String?,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(HudDark)
            .border(1.dp, HudGray)
            .padding(12.dp)
    ) {
        // Header
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Image,
                contentDescription = null,
                tint = HudText,
                modifier = Modifier.size(16.dp)
            )

            Spacer(modifier = Modifier.width(8.dp))

            Text(
                text = filename ?: "IMAGE",
                color = HudText,
                fontSize = 10.sp,
                letterSpacing = 1.sp
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Image
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data("data:$mimeType;base64,$data")
                .build(),
            contentDescription = filename,
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, HudGray)
        )
    }
}
