package uk.adedamola.aperture.presentation.screen.workspace

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.domain.model.AgentType
import uk.adedamola.aperture.domain.model.ConnectionState
import uk.adedamola.aperture.domain.model.ConnectionStatus
import uk.adedamola.aperture.domain.model.Message
import uk.adedamola.aperture.domain.model.SessionStatus
import uk.adedamola.aperture.domain.model.websocket.OutboundMessage
import uk.adedamola.aperture.domain.repository.SessionRepository
import uk.adedamola.aperture.domain.repository.SettingsRepository
import javax.inject.Inject

data class WorkspaceUiState(
    val sessionId: String = "",
    val sessionStatus: SessionStatus? = null,
    val messages: List<Message> = emptyList(),
    val connectionState: ConnectionState = ConnectionState(),
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val messageInput: String = "",
    val errorMessage: String? = null,
    val showPermissionDialog: Boolean = false,
    val permissionRequest: PermissionRequestState? = null,
    val isConnectedToGateway: Boolean = false
)

data class PermissionRequestState(
    val toolCallId: String,
    val toolName: String,
    val options: List<PermissionOptionState>
)

data class PermissionOptionState(
    val id: String,
    val name: String
)

@HiltViewModel
class WorkspaceViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val sessionRepository: SessionRepository,
    private val settingsRepository: SettingsRepository,
    private val json: Json
) : ViewModel() {

    private val sessionId: String = savedStateHandle.get<String>("sessionId") ?: ""

    private val _uiState = MutableStateFlow(WorkspaceUiState(sessionId = sessionId))
    val uiState: StateFlow<WorkspaceUiState> = _uiState.asStateFlow()

    init {
        if (sessionId.isNotEmpty()) {
            loadSession()
            observeMessages()
            observeConnectionState()
            observeGatewayConnection()
            connectWebSocket()
        }
    }

    private fun loadSession() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            when (val result = sessionRepository.getSession(sessionId)) {
                is Result.Success -> {
                    _uiState.update {
                        it.copy(
                            sessionStatus = result.value,
                            isLoading = false
                        )
                    }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "Failed to load session"
                        )
                    }
                }
            }

            // Load messages
            when (val result = sessionRepository.getMessages(sessionId)) {
                is Result.Success -> {
                    _uiState.update { it.copy(messages = result.value) }
                }
                is Result.Failure -> {
                    // Messages will load from local cache if available
                }
            }
        }
    }

    private fun observeMessages() {
        viewModelScope.launch {
            sessionRepository.observeMessages(sessionId).collect { messages ->
                _uiState.update { it.copy(messages = messages) }
            }
        }
    }

    private fun observeConnectionState() {
        viewModelScope.launch {
            sessionRepository.connectionStates.collect { states ->
                val state = states[sessionId] ?: ConnectionState()
                _uiState.update { it.copy(connectionState = state) }
            }
        }
    }

    private fun observeGatewayConnection() {
        viewModelScope.launch {
            settingsRepository.isConnected.collect { isConnected ->
                _uiState.update { it.copy(isConnectedToGateway = isConnected) }
            }
        }
    }

    private fun connectWebSocket() {
        viewModelScope.launch {
            sessionRepository.connectWebSocket(sessionId)
        }
    }

    fun updateMessageInput(text: String) {
        _uiState.update { it.copy(messageInput = text) }
    }

    fun sendMessage() {
        val content = _uiState.value.messageInput.trim()
        if (content.isEmpty()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSending = true, messageInput = "") }

            val message = OutboundMessage.UserMessage(content = content)
            val success = sessionRepository.sendMessage(sessionId, message)

            if (!success) {
                _uiState.update {
                    it.copy(
                        isSending = false,
                        messageInput = content, // Restore input
                        errorMessage = "Failed to send message"
                    )
                }
            } else {
                _uiState.update { it.copy(isSending = false) }
            }
        }
    }

    fun cancelPrompt() {
        viewModelScope.launch {
            val message = OutboundMessage.Cancel()
            sessionRepository.sendMessage(sessionId, message)
        }
    }

    fun respondToPermission(optionId: String?) {
        val request = _uiState.value.permissionRequest ?: return

        viewModelScope.launch {
            val message = OutboundMessage.PermissionResponse(
                toolCallId = request.toolCallId,
                optionId = optionId
            )
            sessionRepository.sendMessage(sessionId, message)

            _uiState.update {
                it.copy(
                    showPermissionDialog = false,
                    permissionRequest = null
                )
            }
        }
    }

    fun dismissPermissionDialog() {
        _uiState.update {
            it.copy(
                showPermissionDialog = false,
                permissionRequest = null
            )
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun disconnect() {
        viewModelScope.launch {
            sessionRepository.disconnectWebSocket(sessionId)
        }
    }

    override fun onCleared() {
        super.onCleared()
        disconnect()
    }
}
