package uk.adedamola.aperture.presentation.screen.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.adedamola.aperture.core.util.NetworkError
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.domain.repository.SettingsRepository
import javax.inject.Inject

data class OnboardingUiState(
    val gatewayUrl: String = "",
    val apiToken: String = "",
    val isLoading: Boolean = false,
    val connectionStatus: ConnectionTestStatus = ConnectionTestStatus.Idle,
    val errorMessage: String? = null
)

sealed class ConnectionTestStatus {
    data object Idle : ConnectionTestStatus()
    data object Testing : ConnectionTestStatus()
    data object Success : ConnectionTestStatus()
    data class Error(val message: String) : ConnectionTestStatus()
}

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    init {
        loadSavedCredentials()
    }

    private fun loadSavedCredentials() {
        viewModelScope.launch {
            settingsRepository.gatewayUrl.collect { url ->
                _uiState.update { it.copy(gatewayUrl = url ?: "http://localhost:7080") }
            }
        }
    }

    fun updateGatewayUrl(url: String) {
        _uiState.update {
            it.copy(
                gatewayUrl = url,
                errorMessage = null,
                connectionStatus = ConnectionTestStatus.Idle
            )
        }
    }

    fun updateApiToken(token: String) {
        _uiState.update {
            it.copy(
                apiToken = token,
                errorMessage = null,
                connectionStatus = ConnectionTestStatus.Idle
            )
        }
    }

    fun testConnection(onSuccess: () -> Unit) {
        val url = _uiState.value.gatewayUrl.trim()
        val token = _uiState.value.apiToken.trim()

        if (url.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = "Gateway URL is required")
            }
            return
        }

        if (token.isBlank()) {
            _uiState.update {
                it.copy(errorMessage = "API token is required")
            }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = true,
                    connectionStatus = ConnectionTestStatus.Testing,
                    errorMessage = null
                )
            }

            when (val result = settingsRepository.testConnection(url, token)) {
                is Result.Success -> {
                    if (result.value) {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                connectionStatus = ConnectionTestStatus.Success
                            )
                        }
                        onSuccess()
                    } else {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                connectionStatus = ConnectionTestStatus.Error("Gateway not ready"),
                                errorMessage = "Gateway responded but is not ready"
                            )
                        }
                    }
                }
                is Result.Failure -> {
                    val errorMsg = when (val error = result.error) {
                        is NetworkError.ConnectionError -> "Cannot connect to gateway. Check the URL and ensure the server is running."
                        is NetworkError.TimeoutError -> "Connection timed out. The server may be slow or unreachable."
                        is NetworkError.HttpError -> "Server returned error: ${error.code} ${error.message}"
                        is NetworkError.ParseError -> "Invalid response from server"
                        is NetworkError.UnknownError -> "Connection failed: ${error.cause.message}"
                    }
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            connectionStatus = ConnectionTestStatus.Error(errorMsg),
                            errorMessage = errorMsg
                        )
                    }
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
