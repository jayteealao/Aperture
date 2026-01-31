package uk.adedamola.aperture.presentation.screen.sessions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.domain.model.AgentType
import uk.adedamola.aperture.domain.model.AuthMode
import uk.adedamola.aperture.domain.model.CreateSessionRequest
import uk.adedamola.aperture.domain.model.SessionAuth
import uk.adedamola.aperture.domain.model.SessionStatus
import uk.adedamola.aperture.domain.repository.CredentialRepository
import uk.adedamola.aperture.domain.repository.SessionRepository
import uk.adedamola.aperture.domain.repository.SettingsRepository
import javax.inject.Inject

data class SessionsUiState(
    val sessions: List<SessionStatus> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val showCreateDialog: Boolean = false,
    val isCreating: Boolean = false,
    val isConnected: Boolean = false
)

data class CreateSessionState(
    val agentType: AgentType = AgentType.CLAUDE_SDK,
    val authMode: AuthMode = AuthMode.OAUTH,
    val selectedCredentialId: String? = null,
    val repoPath: String = ""
)

@HiltViewModel
class SessionsViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val credentialRepository: CredentialRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SessionsUiState())
    val uiState: StateFlow<SessionsUiState> = _uiState.asStateFlow()

    private val _createSessionState = MutableStateFlow(CreateSessionState())
    val createSessionState: StateFlow<CreateSessionState> = _createSessionState.asStateFlow()

    init {
        observeSessions()
        observeConnectionStatus()
        loadSessions()
    }

    private fun observeSessions() {
        viewModelScope.launch {
            sessionRepository.sessions.collect { sessions ->
                _uiState.update { it.copy(sessions = sessions) }
            }
        }
    }

    private fun observeConnectionStatus() {
        viewModelScope.launch {
            settingsRepository.isConnected.collect { isConnected ->
                _uiState.update { it.copy(isConnected = isConnected) }
            }
        }
    }

    fun loadSessions() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            when (val result = sessionRepository.refreshSessions()) {
                is Result.Success -> {
                    _uiState.update { it.copy(isLoading = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "Failed to load sessions"
                        )
                    }
                }
            }
        }
    }

    fun refreshSessions() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }

            when (val result = sessionRepository.refreshSessions()) {
                is Result.Success -> {
                    _uiState.update { it.copy(isRefreshing = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isRefreshing = false,
                            errorMessage = "Failed to refresh sessions"
                        )
                    }
                }
            }
        }
    }

    fun showCreateDialog() {
        _uiState.update { it.copy(showCreateDialog = true) }
    }

    fun hideCreateDialog() {
        _uiState.update { it.copy(showCreateDialog = false) }
        _createSessionState.value = CreateSessionState()
    }

    fun updateAgentType(type: AgentType) {
        _createSessionState.update { it.copy(agentType = type) }
    }

    fun updateAuthMode(mode: AuthMode) {
        _createSessionState.update { it.copy(authMode = mode) }
    }

    fun updateSelectedCredential(credentialId: String?) {
        _createSessionState.update { it.copy(selectedCredentialId = credentialId) }
    }

    fun updateRepoPath(path: String) {
        _createSessionState.update { it.copy(repoPath = path) }
    }

    fun createSession(onSuccess: (String) -> Unit) {
        val createState = _createSessionState.value

        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }

            val auth = when (createState.authMode) {
                AuthMode.OAUTH -> SessionAuth(mode = AuthMode.OAUTH)
                AuthMode.API_KEY -> SessionAuth(
                    mode = AuthMode.API_KEY,
                    storedCredentialId = createState.selectedCredentialId
                )
            }

            val request = CreateSessionRequest(
                agent = createState.agentType,
                auth = auth,
                repoPath = createState.repoPath.takeIf { it.isNotBlank() }
            )

            when (val result = sessionRepository.createSession(request)) {
                is Result.Success -> {
                    _uiState.update {
                        it.copy(
                            isCreating = false,
                            showCreateDialog = false
                        )
                    }
                    _createSessionState.value = CreateSessionState()
                    onSuccess(result.value.id)
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isCreating = false,
                            errorMessage = "Failed to create session"
                        )
                    }
                }
            }
        }
    }

    fun deleteSession(sessionId: String) {
        viewModelScope.launch {
            when (val result = sessionRepository.deleteSession(sessionId)) {
                is Result.Success -> {
                    // Session removed, list will update automatically
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(errorMessage = "Failed to delete session")
                    }
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
