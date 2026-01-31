package uk.adedamola.aperture.presentation.screen.workspaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.domain.model.CreateWorkspaceRequest
import uk.adedamola.aperture.domain.model.WorkspaceRecord
import uk.adedamola.aperture.domain.repository.SettingsRepository
import uk.adedamola.aperture.domain.repository.WorkspaceRepository
import javax.inject.Inject

data class WorkspacesUiState(
    val workspaces: List<WorkspaceRecord> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isCreating: Boolean = false,
    val errorMessage: String? = null,
    val isConnected: Boolean = false
)

@HiltViewModel
class WorkspacesViewModel @Inject constructor(
    private val workspaceRepository: WorkspaceRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorkspacesUiState())
    val uiState: StateFlow<WorkspacesUiState> = _uiState.asStateFlow()

    init {
        observeWorkspaces()
        observeConnectionStatus()
        loadWorkspaces()
    }

    private fun observeWorkspaces() {
        viewModelScope.launch {
            workspaceRepository.workspaces.collect { workspaces ->
                _uiState.update { it.copy(workspaces = workspaces) }
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

    private fun loadWorkspaces() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            when (val result = workspaceRepository.refreshWorkspaces()) {
                is Result.Success -> {
                    _uiState.update { it.copy(isLoading = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = "Failed to load workspaces"
                        )
                    }
                }
            }
        }
    }

    fun refreshWorkspaces() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }

            when (val result = workspaceRepository.refreshWorkspaces()) {
                is Result.Success -> {
                    _uiState.update { it.copy(isRefreshing = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isRefreshing = false,
                            errorMessage = "Failed to refresh workspaces"
                        )
                    }
                }
            }
        }
    }

    fun createWorkspace(name: String, repoRoot: String, description: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }

            val request = CreateWorkspaceRequest(
                name = name,
                repoRoot = repoRoot,
                description = description
            )

            when (val result = workspaceRepository.createWorkspace(request)) {
                is Result.Success -> {
                    _uiState.update { it.copy(isCreating = false) }
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(
                            isCreating = false,
                            errorMessage = "Failed to create workspace"
                        )
                    }
                }
            }
        }
    }

    fun deleteWorkspace(workspaceId: String) {
        viewModelScope.launch {
            when (val result = workspaceRepository.deleteWorkspace(workspaceId)) {
                is Result.Success -> {
                    // Workspace deleted, list updates automatically
                }
                is Result.Failure -> {
                    _uiState.update {
                        it.copy(errorMessage = "Failed to delete workspace")
                    }
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
