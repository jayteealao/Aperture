package uk.adedamola.aperture.presentation.screen.help

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Help
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.adedamola.aperture.ui.components.HudAccordion
import uk.adedamola.aperture.ui.components.layout.HudShell
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun HelpScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: HelpViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    HudShell(
        title = "Help",
        currentRoute = "help",
        onNavigate = onNavigate,
        onBackClick = onBack,
        isConnected = uiState.isConnected
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Quick Start
            HudAccordion(
                title = "Quick Start",
                icon = Icons.Default.RocketLaunch,
                initiallyExpanded = true
            ) {
                Column {
                    HelpText("1. Connect to your Aperture Gateway by entering the URL and API token.")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("2. Create a new session by clicking the + button on the Sessions page.")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("3. Select an agent type (Claude SDK or Pi SDK) and authentication method.")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("4. Start chatting! Use Ctrl+Enter to send messages quickly.")
                }
            }

            // Claude SDK
            HudAccordion(
                title = "Claude SDK",
                icon = Icons.Default.SmartToy
            ) {
                Column {
                    HelpText("The Claude SDK provides access to Claude's full capabilities:")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("• Tool use for file operations, shell commands, and more")
                    HelpText("• Extended thinking for complex reasoning")
                    HelpText("• MCP server integration for additional tools")
                    HelpText("• Permission management for secure operations")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("Configure model selection and thinking tokens in the control panel.")
                }
            }

            // Pi SDK
            HudAccordion(
                title = "Pi SDK",
                icon = Icons.Default.Memory
            ) {
                Column {
                    HelpText("The Pi SDK offers a streamlined agent experience:")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("• Multiple model providers (Anthropic, OpenAI, Google, Groq)")
                    HelpText("• Adjustable thinking levels")
                    HelpText("• Steer and follow-up during streaming")
                    HelpText("• Session forking for exploring alternatives")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("Use the control panel to cycle models and adjust settings.")
                }
            }

            // Session Management
            HudAccordion(
                title = "Session Management",
                icon = Icons.Default.Code
            ) {
                Column {
                    HelpText("Sessions maintain conversation context with the AI:")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("• Each session has its own message history")
                    HelpText("• Sessions can be resumed if marked as resumable")
                    HelpText("• Delete sessions to free up resources")
                    HelpText("• Working directory is shown for context")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("Messages are cached locally for offline viewing.")
                }
            }

            // Credentials & Authentication
            HudAccordion(
                title = "Credentials & Authentication",
                icon = Icons.Default.Key
            ) {
                Column {
                    HelpText("Manage your API credentials securely:")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("• Credentials are AES-256 encrypted at rest")
                    HelpText("• Support for multiple providers")
                    HelpText("• OAuth authentication available for some services")
                    HelpText("• API keys decrypted only when needed")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("Add credentials in the Credentials page before creating sessions.")
                }
            }

            // Troubleshooting
            HudAccordion(
                title = "Troubleshooting",
                icon = Icons.Default.Help
            ) {
                Column {
                    HelpText("Common issues and solutions:")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("• Connection failed: Check gateway URL and ensure server is running")
                    HelpText("• Authentication error: Verify API token is correct")
                    HelpText("• Session not responding: Try reconnecting or create new session")
                    HelpText("• Messages not loading: Check network connection")
                    Spacer(modifier = Modifier.height(8.dp))
                    HelpText("Clear all data in Settings to reset the app if issues persist.")
                }
            }
        }
    }
}

@Composable
private fun HelpText(text: String) {
    Text(
        text = text,
        color = HudText,
        fontSize = 13.sp,
        lineHeight = 18.sp
    )
}
