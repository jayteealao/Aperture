package uk.adedamola.aperture.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudError
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun HudTextarea(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String = "",
    minHeight: Dp = 100.dp,
    maxHeight: Dp = 300.dp,
    isError: Boolean = false,
    errorMessage: String? = null,
    enabled: Boolean = true,
    maxLines: Int = Int.MAX_VALUE,
    onCtrlEnter: (() -> Unit)? = null,
    showCharCount: Boolean = false,
    maxChars: Int? = null
) {
    var isFocused by remember { mutableStateOf(false) }
    val scrollState = rememberScrollState()

    val borderColor by animateColorAsState(
        targetValue = when {
            isError -> HudError
            isFocused -> HudAccent
            else -> HudGray
        },
        label = "borderColor"
    )

    Column(modifier = modifier) {
        // Label
        if (label != null) {
            Text(
                text = label.uppercase(),
                color = if (isError) HudError else HudText,
                fontSize = 10.sp,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
        }

        // Textarea
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = minHeight, max = maxHeight)
                .background(HudDark)
                .border(1.dp, borderColor)
                .hudCornerBrackets(
                    color = borderColor,
                    bracketLength = 8.dp,
                    strokeWidth = 1.dp
                )
        ) {
            BasicTextField(
                value = value,
                onValueChange = { newValue ->
                    if (maxChars == null || newValue.length <= maxChars) {
                        onValueChange(newValue)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
                    .verticalScroll(scrollState)
                    .onFocusChanged { isFocused = it.isFocused }
                    .onKeyEvent { keyEvent ->
                        if (keyEvent.type == KeyEventType.KeyDown &&
                            keyEvent.key == Key.Enter &&
                            keyEvent.isCtrlPressed &&
                            onCtrlEnter != null
                        ) {
                            onCtrlEnter()
                            true
                        } else {
                            false
                        }
                    },
                enabled = enabled,
                textStyle = TextStyle(
                    color = if (enabled) HudWhite else HudText,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                ),
                cursorBrush = SolidColor(HudAccent),
                maxLines = maxLines,
                decorationBox = { innerTextField ->
                    Box {
                        if (value.isEmpty()) {
                            Text(
                                text = placeholder,
                                color = HudText.copy(alpha = 0.5f),
                                fontSize = 14.sp
                            )
                        }
                        innerTextField()
                    }
                }
            )
        }

        // Footer row
        if (isError && errorMessage != null || showCharCount) {
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Error message
                if (isError && errorMessage != null) {
                    Text(
                        text = errorMessage,
                        color = HudError,
                        fontSize = 11.sp,
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    Spacer(modifier = Modifier.weight(1f))
                }

                // Character count
                if (showCharCount) {
                    val countText = if (maxChars != null) {
                        "${value.length}/$maxChars"
                    } else {
                        "${value.length}"
                    }
                    val countColor = if (maxChars != null && value.length >= maxChars) {
                        HudError
                    } else {
                        HudText
                    }
                    Text(
                        text = countText,
                        color = countColor,
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}
