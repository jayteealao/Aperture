package uk.adedamola.aperture.presentation.screen.workspace

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.adedamola.aperture.core.util.toSessionIdShort
import uk.adedamola.aperture.domain.model.AgentType
import uk.adedamola.aperture.domain.model.ConnectionStatus
import uk.adedamola.aperture.domain.model.ContentBlock
import uk.adedamola.aperture.domain.model.Message
import uk.adedamola.aperture.domain.model.MessageContent
import uk.adedamola.aperture.domain.model.MessageRole
import uk.adedamola.aperture.presentation.screen.workspace.components.ContentBlockRenderer
import uk.adedamola.aperture.ui.components.HudBadge
import uk.adedamola.aperture.ui.components.HudBadgeVariant
import uk.adedamola.aperture.ui.components.HudButton
import uk.adedamola.aperture.ui.components.HudCard
import uk.adedamola.aperture.ui.components.HudSkeletonMessage
import uk.adedamola.aperture.ui.components.HudSpinner
import uk.adedamola.aperture.ui.components.HudStatusDot
import uk.adedamola.aperture.ui.components.HudTextarea
import uk.adedamola.aperture.ui.components.layout.HudShell
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudDark
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudGrayLight
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun WorkspaceScreen(
    sessionId: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: WorkspaceViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    HudShell(
        title = "Workspace",
        subtitle = sessionId.toSessionIdShort(),
        currentRoute = "sessions",
        onNavigate = onNavigate,
        onBackClick = onBack,
        isConnected = uiState.isConnectedToGateway
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Session header
            SessionHeader(
                agentType = uiState.sessionStatus?.agent ?: AgentType.CLAUDE_SDK,
                sessionId = sessionId,
                connectionStatus = uiState.connectionState.status,
                isStreaming = uiState.connectionState.isStreaming,
                workingDirectory = uiState.sessionStatus?.workingDirectory
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Messages
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                if (uiState.isLoading) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        HudSkeletonMessage(isUser = true)
                        HudSkeletonMessage(isUser = false)
                    }
                } else if (uiState.messages.isEmpty()) {
                    EmptyMessagesState()
                } else {
                    MessageList(
                        messages = uiState.messages,
                        isStreaming = uiState.connectionState.isStreaming
                    )
                }
            }

            // Message input
            MessageInputArea(
                value = uiState.messageInput,
                onValueChange = viewModel::updateMessageInput,
                onSend = viewModel::sendMessage,
                onCancel = viewModel::cancelPrompt,
                isSending = uiState.isSending,
                isStreaming = uiState.connectionState.isStreaming,
                isConnected = uiState.connectionState.status == ConnectionStatus.CONNECTED
            )
        }
    }
}

@Composable
private fun SessionHeader(
    agentType: AgentType,
    sessionId: String,
    connectionStatus: ConnectionStatus,
    isStreaming: Boolean,
    workingDirectory: String?
) {
    HudCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Agent icon
            Icon(
                imageVector = when (agentType) {
                    AgentType.CLAUDE_SDK -> Icons.Default.SmartToy
                    AgentType.PI_SDK -> Icons.Default.Memory
                },
                contentDescription = null,
                tint = HudAccent,
                modifier = Modifier.size(24.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = when (agentType) {
                            AgentType.CLAUDE_SDK -> "CLAUDE SDK"
                            AgentType.PI_SDK -> "PI SDK"
                        },
                        color = HudWhite,
                        fontSize = 12.sp,
                        letterSpacing = 1.sp
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    HudBadge(
                        text = sessionId.toSessionIdShort(),
                        variant = HudBadgeVariant.DEFAULT
                    )
                }

                if (workingDirectory != null) {
                    Text(
                        text = workingDirectory,
                        color = HudText,
                        fontSize = 10.sp,
                        maxLines = 1
                    )
                }
            }

            // Connection status
            Row(verticalAlignment = Alignment.CenterVertically) {
                HudStatusDot(
                    color = when (connectionStatus) {
                        ConnectionStatus.CONNECTED -> HudAccent
                        ConnectionStatus.CONNECTING,
                        ConnectionStatus.RECONNECTING -> HudGray
                        else -> HudGray
                    },
                    size = 8.dp,
                    animated = isStreaming
                )

                Spacer(modifier = Modifier.width(6.dp))

                Text(
                    text = when {
                        isStreaming -> "STREAMING"
                        connectionStatus == ConnectionStatus.CONNECTED -> "CONNECTED"
                        connectionStatus == ConnectionStatus.CONNECTING -> "CONNECTING"
                        connectionStatus == ConnectionStatus.RECONNECTING -> "RECONNECTING"
                        else -> "DISCONNECTED"
                    },
                    color = HudText,
                    fontSize = 10.sp,
                    letterSpacing = 1.sp
                )
            }
        }
    }
}

@Composable
private fun MessageList(
    messages: List<Message>,
    isStreaming: Boolean
) {
    val listState = rememberLazyListState()

    // Auto-scroll to bottom when new messages arrive
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(
            items = messages,
            key = { it.id }
        ) { message ->
            MessageBubble(message = message)
        }

        // Streaming indicator
        if (isStreaming) {
            item {
                Row(
                    modifier = Modifier.padding(start = 36.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    HudSpinner(size = 16.dp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Thinking...",
                        color = HudText,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: Message) {
    val isUser = message.role == MessageRole.USER

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        if (!isUser) {
            Icon(
                imageVector = Icons.Default.SmartToy,
                contentDescription = null,
                tint = HudAccent,
                modifier = Modifier
                    .size(24.dp)
                    .padding(top = 4.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
        }

        Box(
            modifier = Modifier
                .fillMaxWidth(if (isUser) 0.75f else 0.9f)
                .background(if (isUser) HudDark else HudGray.copy(alpha = 0.2f))
                .border(
                    width = 1.dp,
                    color = if (isUser) HudAccent.copy(alpha = 0.5f) else HudGray
                )
                .padding(12.dp)
        ) {
            Column {
                // Role label
                Text(
                    text = if (isUser) "YOU" else "ASSISTANT",
                    color = HudText,
                    fontSize = 10.sp,
                    letterSpacing = 1.sp
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Content
                when (val content = message.content) {
                    is MessageContent.Text -> {
                        Text(
                            text = content.text,
                            color = HudWhite,
                            fontSize = 14.sp,
                            lineHeight = 20.sp
                        )
                    }
                    is MessageContent.Blocks -> {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            content.blocks.forEach { block ->
                                ContentBlockRenderer(block = block)
                            }
                        }
                    }
                }
            }
        }

        if (isUser) {
            Spacer(modifier = Modifier.width(8.dp))
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = null,
                tint = HudText,
                modifier = Modifier
                    .size(24.dp)
                    .padding(top = 4.dp)
            )
        }
    }
}

@Composable
private fun EmptyMessagesState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.SmartToy,
                contentDescription = null,
                tint = HudGray,
                modifier = Modifier.size(48.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Start a conversation",
                color = HudText,
                fontSize = 14.sp
            )

            Text(
                text = "Type a message below to begin",
                color = HudGray,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun MessageInputArea(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancel: () -> Unit,
    isSending: Boolean,
    isStreaming: Boolean,
    isConnected: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(HudDark)
            .border(1.dp, HudGray)
            .padding(12.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        // Input field
        HudTextarea(
            value = value,
            onValueChange = onValueChange,
            placeholder = if (isConnected) "Type your message..." else "Connecting...",
            minHeight = 48.dp,
            maxHeight = 150.dp,
            enabled = isConnected && !isSending && !isStreaming,
            onCtrlEnter = onSend,
            modifier = Modifier.weight(1f)
        )

        Spacer(modifier = Modifier.width(8.dp))

        // Send/Cancel button
        if (isStreaming) {
            IconButton(
                onClick = onCancel,
                modifier = Modifier.size(48.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Stop,
                    contentDescription = "Cancel",
                    tint = HudAccent,
                    modifier = Modifier.size(24.dp)
                )
            }
        } else {
            IconButton(
                onClick = onSend,
                enabled = value.isNotBlank() && isConnected && !isSending,
                modifier = Modifier.size(48.dp)
            ) {
                if (isSending) {
                    HudSpinner(size = 24.dp)
                } else {
                    Icon(
                        imageVector = Icons.Default.Send,
                        contentDescription = "Send",
                        tint = if (value.isNotBlank() && isConnected) HudAccent else HudGray,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }
        }
    }
}
