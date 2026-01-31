package uk.adedamola.aperture.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class WorkspaceRecord(
    val id: String,
    val name: String,
    val repoRoot: String,
    val description: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val metadata: String? = null
)

@Serializable
data class WorkspaceAgentRecord(
    val id: String,
    val workspaceId: String,
    val sessionId: String? = null,
    val branch: String,
    val worktreePath: String,
    val createdAt: String,
    val updatedAt: String
)

@Serializable
data class WorktreeInfo(
    val branch: String,
    val path: String,
    val isMain: Boolean,
    val isLocked: Boolean
)

@Serializable
data class CreateWorkspaceRequest(
    val name: String? = null,
    val repoRoot: String? = null,
    val description: String? = null
)

@Serializable
data class CloneWorkspaceRequest(
    val remoteUrl: String,
    val targetDirectory: String,
    val name: String? = null
)

@Serializable
data class CloneWorkspaceResponse(
    val workspace: WorkspaceRecord
)

@Serializable
data class InitRepoRequest(
    val path: String,
    val name: String? = null,
    val createWorkspace: Boolean? = null
)

@Serializable
data class InitRepoResponse(
    val path: String,
    val workspace: WorkspaceRecord? = null
)

@Serializable
data class DiscoveredRepo(
    val path: String,
    val name: String,
    val remoteUrl: String? = null,
    val hasOrigin: Boolean
)

@Serializable
data class DiscoveryResult(
    val repos: List<DiscoveredRepo>,
    val scannedDirectories: Int,
    val errors: List<DiscoveryError>
)

@Serializable
data class DiscoveryError(
    val path: String,
    val error: String
)
