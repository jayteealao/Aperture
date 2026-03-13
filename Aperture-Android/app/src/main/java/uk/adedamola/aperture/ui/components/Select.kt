package uk.adedamola.aperture.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudBlack
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudGrayLight
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

data class SelectOption<T>(
    val value: T,
    val label: String,
    val description: String? = null,
    val icon: ImageVector? = null
)

@Composable
fun <T> HudSelect(
    options: List<SelectOption<T>>,
    selectedValue: T?,
    onValueChange: (T) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String = "Select...",
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null
) {
    var expanded by remember { mutableStateOf(false) }

    val selectedOption = options.find { it.value == selectedValue }

    val borderColor by animateColorAsState(
        targetValue = if (expanded) HudAccent else HudGray,
        label = "borderColor"
    )

    val arrowRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        label = "arrowRotation"
    )

    Column(modifier = modifier) {
        // Label
        if (label != null) {
            Text(
                text = label.uppercase(),
                color = HudText,
                fontSize = 10.sp,
                letterSpacing = 1.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
        }

        // Select field
        Box {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(HudDark)
                    .border(1.dp, borderColor)
                    .hudCornerBrackets(
                        color = borderColor,
                        bracketLength = 8.dp,
                        strokeWidth = 1.dp
                    )
                    .clickable(enabled = enabled) { expanded = true }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Leading icon
                if (leadingIcon != null) {
                    Icon(
                        imageVector = leadingIcon,
                        contentDescription = null,
                        tint = HudText,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                } else if (selectedOption?.icon != null) {
                    Icon(
                        imageVector = selectedOption.icon,
                        contentDescription = null,
                        tint = HudAccent,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }

                // Selected value or placeholder
                Text(
                    text = selectedOption?.label ?: placeholder,
                    color = if (selectedOption != null) HudWhite else HudText.copy(alpha = 0.5f),
                    fontSize = 14.sp,
                    modifier = Modifier.weight(1f)
                )

                // Dropdown arrow
                Icon(
                    imageVector = Icons.Default.KeyboardArrowDown,
                    contentDescription = if (expanded) "Collapse" else "Expand",
                    tint = HudText,
                    modifier = Modifier
                        .size(20.dp)
                        .rotate(arrowRotation)
                )
            }

            // Dropdown menu
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                modifier = Modifier
                    .background(HudBlack)
                    .border(1.dp, HudGray)
            ) {
                Column(
                    modifier = Modifier
                        .heightIn(max = 300.dp)
                        .verticalScroll(rememberScrollState())
                        .padding(4.dp)
                ) {
                    options.forEach { option ->
                        val isSelected = option.value == selectedValue

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    if (isSelected) HudGray.copy(alpha = 0.3f) else HudBlack
                                )
                                .clickable {
                                    onValueChange(option.value)
                                    expanded = false
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Option icon
                            if (option.icon != null) {
                                Icon(
                                    imageVector = option.icon,
                                    contentDescription = null,
                                    tint = if (isSelected) HudAccent else HudText,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }

                            // Option content
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = option.label,
                                    color = if (isSelected) HudWhite else HudText,
                                    fontSize = 14.sp
                                )
                                if (option.description != null) {
                                    Text(
                                        text = option.description,
                                        color = HudText.copy(alpha = 0.7f),
                                        fontSize = 11.sp
                                    )
                                }
                            }

                            // Selected checkmark
                            if (isSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Selected",
                                    tint = HudAccent,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
