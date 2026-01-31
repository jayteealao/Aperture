package uk.adedamola.aperture.data.repository

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import uk.adedamola.aperture.core.util.NetworkResult
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.data.remote.api.ApertureApi
import uk.adedamola.aperture.domain.model.CloneWorkspaceRequest
import uk.adedamola.aperture.domain.model.CreateWorkspaceRequest
import uk.adedamola.aperture.domain.model.DiscoveredRepo
import uk.adedamola.aperture.domain.model.WorkspaceAgentRecord
import uk.adedamola.aperture.domain.model.WorkspaceRecord
import uk.adedamola.aperture.domain.model.WorktreeInfo
import uk.adedamola.aperture.domain.repository.WorkspaceRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WorkspaceRepositoryImpl @Inject constructor(
    private val api: ApertureApi
) : WorkspaceRepository {

    private val _workspaces = MutableStateFlow<List<WorkspaceRecord>>(emptyList())
    override val workspaces: Flow<List<WorkspaceRecord>> = _workspaces.asStateFlow()

    override suspend fun refreshWorkspaces(): NetworkResult<List<WorkspaceRecord>> {
        return when (val result = api.listWorkspaces()) {
            is Result.Success -> {
                val workspaces = result.value.workspaces
                _workspaces.value = workspaces
                Result.Success(workspaces)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun createWorkspace(request: CreateWorkspaceRequest): NetworkResult<WorkspaceRecord> {
        return when (val result = api.createWorkspace(request)) {
            is Result.Success -> {
                refreshWorkspaces()
                Result.Success(result.value)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun deleteWorkspace(id: String): NetworkResult<Unit> {
        return when (val result = api.deleteWorkspace(id)) {
            is Result.Success -> {
                refreshWorkspaces()
                Result.Success(Unit)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun getWorkspace(id: String): NetworkResult<WorkspaceRecord?> {
        return when (val result = api.getWorkspace(id)) {
            is Result.Success -> Result.Success(result.value)
            is Result.Failure -> result
        }
    }

    override suspend fun getWorkspaceAgents(workspaceId: String): NetworkResult<List<WorkspaceAgentRecord>> {
        return when (val result = api.getWorkspaceAgents(workspaceId)) {
            is Result.Success -> Result.Success(result.value.agents)
            is Result.Failure -> result
        }
    }

    override suspend fun getWorktrees(workspaceId: String): NetworkResult<List<WorktreeInfo>> {
        return when (val result = api.getWorktrees(workspaceId)) {
            is Result.Success -> Result.Success(result.value.worktrees)
            is Result.Failure -> result
        }
    }

    override suspend fun scanForRepos(startPath: String, maxDepth: Int): NetworkResult<List<DiscoveredRepo>> {
        return when (val result = api.scanForRepos(startPath, maxDepth)) {
            is Result.Success -> Result.Success(result.value.repos)
            is Result.Failure -> result
        }
    }

    override suspend fun cloneRepo(
        remoteUrl: String,
        targetDir: String,
        name: String?
    ): NetworkResult<WorkspaceRecord> {
        val request = CloneWorkspaceRequest(
            remoteUrl = remoteUrl,
            targetDirectory = targetDir,
            name = name
        )
        return when (val result = api.cloneRepo(request)) {
            is Result.Success -> {
                refreshWorkspaces()
                Result.Success(result.value.workspace)
            }
            is Result.Failure -> result
        }
    }
}
