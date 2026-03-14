package uk.adedamola.aperture.domain.repository

import kotlinx.coroutines.flow.Flow
import uk.adedamola.aperture.core.util.NetworkResult
import uk.adedamola.aperture.domain.model.ConnectionState
import uk.adedamola.aperture.domain.model.CreateCredentialRequest
import uk.adedamola.aperture.domain.model.CreateSessionRequest
import uk.adedamola.aperture.domain.model.CreateWorkspaceRequest
import uk.adedamola.aperture.domain.model.Credential
import uk.adedamola.aperture.domain.model.ManagedRepo
import uk.adedamola.aperture.domain.model.Message
import uk.adedamola.aperture.domain.model.ResumableSession
import uk.adedamola.aperture.domain.model.Session
import uk.adedamola.aperture.domain.model.SessionStatus
import uk.adedamola.aperture.domain.model.CheckoutRecord
import uk.adedamola.aperture.domain.model.WorkspaceRecord
import uk.adedamola.aperture.domain.model.websocket.OutboundMessage

interface SessionRepository {
    val sessions: Flow<List<SessionStatus>>
    val connectionStates: Flow<Map<String, ConnectionState>>

    suspend fun refreshSessions(): NetworkResult<List<SessionStatus>>
    suspend fun createSession(request: CreateSessionRequest): NetworkResult<Session>
    suspend fun getSession(sessionId: String): NetworkResult<SessionStatus>
    suspend fun deleteSession(sessionId: String): NetworkResult<Unit>
    suspend fun deleteSessionLocally(sessionId: String)
    suspend fun getResumableSessions(): NetworkResult<List<ResumableSession>>

    // WebSocket operations
    suspend fun connectWebSocket(sessionId: String): NetworkResult<Unit>
    suspend fun disconnectWebSocket(sessionId: String)
    suspend fun sendMessage(sessionId: String, message: OutboundMessage): Boolean

    // Messages
    suspend fun getMessages(sessionId: String, limit: Int = 50, offset: Int = 0): NetworkResult<List<Message>>
    fun observeMessages(sessionId: String): Flow<List<Message>>
    suspend fun saveUserMessage(sessionId: String, content: String): Message

    // Managed repos
    suspend fun getManagedRepos(workspaceId: String = "default"): NetworkResult<List<ManagedRepo>>
}

interface CredentialRepository {
    val credentials: Flow<List<Credential>>

    suspend fun refreshCredentials(): NetworkResult<List<Credential>>
    suspend fun createCredential(request: CreateCredentialRequest): NetworkResult<Credential>
    suspend fun deleteCredential(id: String): NetworkResult<Unit>
    suspend fun getCredential(id: String): NetworkResult<Credential?>
}

interface WorkspaceRepository {
    val workspaces: Flow<List<WorkspaceRecord>>

    suspend fun refreshWorkspaces(): NetworkResult<List<WorkspaceRecord>>
    suspend fun createWorkspace(request: CreateWorkspaceRequest): NetworkResult<WorkspaceRecord>
    suspend fun deleteWorkspace(id: String): NetworkResult<Unit>
    suspend fun getWorkspace(id: String): NetworkResult<WorkspaceRecord?>

    suspend fun getWorkspaceCheckouts(workspaceId: String): NetworkResult<List<CheckoutRecord>>

    suspend fun scanForRepos(startPath: String, maxDepth: Int = 3): NetworkResult<List<uk.adedamola.aperture.domain.model.DiscoveredRepo>>
    suspend fun cloneRepo(remoteUrl: String, targetDir: String, name: String?): NetworkResult<WorkspaceRecord>
}

interface SettingsRepository {
    val gatewayUrl: Flow<String?>
    val apiToken: Flow<String?>
    val isConnected: Flow<Boolean>

    suspend fun setGatewayUrl(url: String)
    suspend fun setApiToken(token: String)
    suspend fun setConnected(connected: Boolean)
    suspend fun clearAll()

    suspend fun testConnection(url: String, token: String): NetworkResult<Boolean>
}
