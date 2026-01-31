package uk.adedamola.aperture.presentation.screen.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.adedamola.aperture.domain.repository.SettingsRepository
import javax.inject.Inject

data class SettingsUiState(
    val gatewayUrl: String? = null,
    val isConnected: Boolean = false
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        observeSettings()
    }

    private fun observeSettings() {
        viewModelScope.launch {
            settingsRepository.gatewayUrl.collect { url ->
                _uiState.update { it.copy(gatewayUrl = url) }
            }
        }

        viewModelScope.launch {
            settingsRepository.isConnected.collect { isConnected ->
                _uiState.update { it.copy(isConnected = isConnected) }
            }
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            settingsRepository.setConnected(false)
        }
    }

    fun clearAllData() {
        viewModelScope.launch {
            settingsRepository.clearAll()
        }
    }
}
