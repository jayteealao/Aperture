package uk.adedamola.aperture.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import uk.adedamola.aperture.domain.model.sdk.PiSessionConfig
import uk.adedamola.aperture.domain.model.sdk.SdkSessionConfig

@Serializable
data class SessionStatus(
    val id: String,
    val agent: AgentType,
    val authMode: String,
    val running: Boolean,
    val pendingRequests: Int,
    val lastActivityTime: Long,
    val idleMs: Long,
    val acpSessionId: String? = null,
    val sdkSessionId: String? = null,
    val piSessionPath: String? = null,
    val isResumable: Boolean? = null,
    val workingDirectory: String? = null,
    val thinkingLevel: String? = null
)

@Serializable
data class Session(
    val id: String,
    val agent: AgentType,
    val status: SessionStatus
)

@Serializable
data class SessionAuth(
    val mode: AuthMode,
    val providerKey: ProviderKey? = null,
    val apiKeyRef: ApiKeyRef? = null,
    val apiKey: String? = null,
    val storedCredentialId: String? = null
)

@Serializable
data class CreateSessionRequest(
    val agent: AgentType? = null,
    val auth: SessionAuth? = null,
    val env: Map<String, String>? = null,
    val workspaceId: String? = null,
    val repoPath: String? = null, // DEPRECATED: Use repoMode instead
    val sdk: SdkSessionConfig? = null,
    val pi: PiSessionConfig? = null,
    // New repo mode fields
    val repoMode: RepoMode? = null,
    val repoUrl: String? = null,
    val existingRepoId: String? = null
)

@Serializable
data class ResumableSession(
    val id: String,
    val agent: String,
    val sdkSessionId: String? = null,
    val piSessionPath: String? = null,
    val lastActivity: Long,
    val workingDirectory: String? = null
)

/**
 * Connection state for UI display
 */
data class ConnectionState(
    val status: ConnectionStatus = ConnectionStatus.DISCONNECTED,
    val error: String? = null,
    val retryCount: Int = 0,
    val isStreaming: Boolean = false,
    val hasUnread: Boolean = false,
    val unreadCount: Int = 0,
    val lastActivity: Long = 0,
    val currentStreamMessageId: String? = null
)
