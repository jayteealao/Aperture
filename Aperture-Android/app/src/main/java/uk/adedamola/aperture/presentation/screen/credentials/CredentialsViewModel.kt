package uk.adedamola.aperture.presentation.screen.credentials

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.domain.model.CreateCredentialRequest
import uk.adedamola.aperture.domain.model.Credential
import uk.adedamola.aperture.domain.model.ProviderKey
import uk.adedamola.aperture.domain.repository.CredentialRepository
import uk.adedamola.aperture.domain.repository.SettingsRepository
import javax.inject.Inject

data class CredentialsUiState(
    val credentials: List<Credential> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isCreating: Boolean = false,
    val errorMessage: String? = null,
    val isConnected: Boolean = false
)

@HiltViewModel
class CredentialsViewModel @Inject constructor(
    private val credentialRepository: CredentialRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CredentialsUiState())
    val uiState: StateFlow<CredentialsUiState> = _uiState.asStateFlow()

    init {
        observeCredentials()
        observeConnectionStatus()
        loadCredentials()
    }

    private fun observeCredentials() {
        viewModelScope.launch {
            credentialRepository.credentials.collect { credentials ->
                _uiState.update { it.copy(credentials = credentials) }
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

    private fun loadCredentials() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            when (val result = credentialRepository.refreshCredentials()) {
                is Result.Success -> {
                    _uiState.update { it.copy(isLoading = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "Failed to load credentials"
                        )
                    }
                }
            }
        }
    }

    fun refreshCredentials() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }

            when (val result = credentialRepository.refreshCredentials()) {
                is Result.Success -> {
                    _uiState.update { it.copy(isRefreshing = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isRefreshing = false,
                            errorMessage = "Failed to refresh credentials"
                        )
                    }
                }
            }
        }
    }

    fun createCredential(provider: ProviderKey, label: String, apiKey: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }

            val request = CreateCredentialRequest(
                provider = provider,
                label = label,
                apiKey = apiKey
            )

            when (val result = credentialRepository.createCredential(request)) {
                is Result.Success -> {
                    _uiState.update { it.copy(isCreating = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isCreating = false,
                            errorMessage = "Failed to create credential"
                        )
                    }
                }
            }
        }
    }

    fun deleteCredential(credentialId: String) {
        viewModelScope.launch {
            when (val result = credentialRepository.deleteCredential(credentialId)) {
                is Result.Success -> {
                    // Credential deleted, list updates automatically
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(errorMessage = "Failed to delete credential")
                    }
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
