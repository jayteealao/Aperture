package uk.adedamola.aperture.data.repository

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import uk.adedamola.aperture.core.util.NetworkResult
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.data.local.db.dao.MessageDao
import uk.adedamola.aperture.data.local.db.dao.SessionDao
import uk.adedamola.aperture.data.local.db.entity.MessageEntity
import uk.adedamola.aperture.data.local.db.entity.SessionEntity
import uk.adedamola.aperture.data.remote.api.ApertureApi
import uk.adedamola.aperture.data.remote.api.WebSocketManager
import uk.adedamola.aperture.domain.model.ConnectionState
import uk.adedamola.aperture.domain.model.ConnectionStatus
import uk.adedamola.aperture.domain.model.ContentBlock
import uk.adedamola.aperture.domain.model.CreateSessionRequest
import uk.adedamola.aperture.domain.model.ManagedRepo
import uk.adedamola.aperture.domain.model.Message
import uk.adedamola.aperture.domain.model.MessageContent
import uk.adedamola.aperture.domain.model.MessageRole
import uk.adedamola.aperture.domain.model.ResumableSession
import uk.adedamola.aperture.domain.model.Session
import uk.adedamola.aperture.domain.model.SessionStatus
import uk.adedamola.aperture.domain.model.websocket.JsonRpcMessage
import uk.adedamola.aperture.domain.model.websocket.OutboundMessage
import uk.adedamola.aperture.domain.model.websocket.SessionUpdateParams
import uk.adedamola.aperture.domain.repository.SessionRepository
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRepositoryImpl @Inject constructor(
    private val api: ApertureApi,
    private val sessionDao: SessionDao,
    private val messageDao: MessageDao,
    private val webSocketManager: WebSocketManager,
    private val json: Json
) : SessionRepository {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _sessions = MutableStateFlow<List<SessionStatus>>(emptyList())
    override val sessions: Flow<List<SessionStatus>> = _sessions.asStateFlow()

    private val _connectionStates = MutableStateFlow<Map<String, ConnectionState>>(emptyMap())
    override val connectionStates: Flow<Map<String, ConnectionState>> = _connectionStates.asStateFlow()

    init {
        // Observe WebSocket status changes
        scope.launch {
            webSocketManager.connectionStatus.collect { statusMap ->
                updateConnectionStates(statusMap)
            }
        }

        // Load cached sessions on init
        scope.launch {
            sessionDao.observeAll().collect { entities ->
                _sessions.value = entities.map { it.toDomainModel() }
            }
        }

        // Process incoming WebSocket messages
        scope.launch {
            webSocketManager.inboundMessages.collect { (sessionId, rawJson) ->
                processInboundMessage(sessionId, rawJson)
            }
        }
    }

    private suspend fun processInboundMessage(sessionId: String, rawJson: String) {
        try {
            val jsonRpc = json.decodeFromString<JsonRpcMessage>(rawJson)
            Log.d("SessionRepository", "Received message: method=${jsonRpc.method}, sessionId=$sessionId")

            when (jsonRpc.method) {
                "session/update" -> {
                    if (jsonRpc.params != null) {
                        try {
                            val params = json.decodeFromJsonElement<SessionUpdateParams>(jsonRpc.params)
                            val content = params.update.content
                            val updateType = params.update.sessionUpdate

                            Log.d("SessionRepository", "Session update type: $updateType, hasContent: ${content != null}")

                            if (content != null) {
                                // Create a message from the content block
                                val message = Message(
                                    id = UUID.randomUUID().toString(),
                                    sessionId = sessionId,
                                    role = MessageRole.ASSISTANT,
                                    content = MessageContent.Blocks(listOf(content)),
                                    timestamp = System.currentTimeMillis().toString()
                                )
                                messageDao.insert(MessageEntity.fromDomainModel(message, json))
                                Log.d("SessionRepository", "Saved message: ${message.id}")
                            }

                            // Update streaming state based on update type
                            updateStreamingState(sessionId, updateType)
                        } catch (e: Exception) {
                            Log.e("SessionRepository", "Failed to parse session/update params", e)
                        }
                    }
                }
                "session/exit" -> {
                    updateStreamingState(sessionId, "ended")
                }
                "session/error" -> {
                    Log.e("SessionRepository", "Session error: ${jsonRpc.params}")
                    updateStreamingState(sessionId, "error")
                }
            }
        } catch (e: Exception) {
            Log.e("SessionRepository", "Failed to process inbound message", e)
        }
    }

    private fun updateStreamingState(sessionId: String, updateType: String) {
        val currentStates = _connectionStates.value.toMutableMap()
        val existing = currentStates[sessionId] ?: ConnectionState()

        val isStreaming = when (updateType) {
            "init", "init_tool", "progress" -> true
            "result", "ended", "error" -> false
            else -> existing.isStreaming
        }

        currentStates[sessionId] = existing.copy(
            isStreaming = isStreaming,
            lastActivity = System.currentTimeMillis()
        )
        _connectionStates.value = currentStates
    }

    private fun updateConnectionStates(statusMap: Map<String, ConnectionStatus>) {
        val currentStates = _connectionStates.value.toMutableMap()
        statusMap.forEach { (sessionId, status) ->
            val existing = currentStates[sessionId] ?: ConnectionState()
            currentStates[sessionId] = existing.copy(
                status = status,
                lastActivity = System.currentTimeMillis()
            )
        }
        _connectionStates.value = currentStates
    }

    override suspend fun refreshSessions(): NetworkResult<List<SessionStatus>> {
        return when (val result = api.listSessions()) {
            is Result.Success -> {
                val sessions = result.value.sessions
                // Cache to database
                sessionDao.insertAll(sessions.map { SessionEntity.fromDomainModel(it) })
                _sessions.value = sessions
                Result.Success(sessions)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun createSession(request: CreateSessionRequest): NetworkResult<Session> {
        return when (val result = api.createSession(request)) {
            is Result.Success -> {
                val session = result.value
                sessionDao.insert(SessionEntity.fromDomainModel(session.status))
                refreshSessions()
                Result.Success(session)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun getSession(sessionId: String): NetworkResult<SessionStatus> {
        return when (val result = api.getSession(sessionId)) {
            is Result.Success -> {
                val status = result.value.status
                sessionDao.insert(SessionEntity.fromDomainModel(status))
                Result.Success(status)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun deleteSession(sessionId: String): NetworkResult<Unit> {
        return when (val result = api.deleteSession(sessionId)) {
            is Result.Success -> {
                sessionDao.deleteById(sessionId)
                messageDao.deleteBySessionId(sessionId)
                webSocketManager.disconnect(sessionId)
                refreshSessions()
                Result.Success(Unit)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun getResumableSessions(): NetworkResult<List<ResumableSession>> {
        return when (val result = api.listResumableSessions()) {
            is Result.Success -> Result.Success(result.value.sessions)
            is Result.Failure -> result
        }
    }

    // WebSocket operations
    override suspend fun connectWebSocket(sessionId: String): NetworkResult<Unit> {
        return when (val result = webSocketManager.connect(sessionId)) {
            is kotlin.Result -> {
                if (result.isSuccess) {
                    Result.Success(Unit)
                } else {
                    Result.Failure(
                        uk.adedamola.aperture.core.util.NetworkError.ConnectionError(
                            result.exceptionOrNull() ?: Exception("Unknown error")
                        )
                    )
                }
            }
        }
    }

    override suspend fun disconnectWebSocket(sessionId: String) {
        webSocketManager.disconnect(sessionId)
    }

    override suspend fun sendMessage(sessionId: String, message: OutboundMessage): Boolean {
        return webSocketManager.send(sessionId, message)
    }

    // Messages
    override suspend fun getMessages(
        sessionId: String,
        limit: Int,
        offset: Int
    ): NetworkResult<List<Message>> {
        return when (val result = api.getMessages(sessionId, limit, offset)) {
            is Result.Success -> {
                val messages = result.value.messages
                // Cache to database
                messageDao.insertAll(messages.map { MessageEntity.fromDomainModel(it, json) })
                Result.Success(messages)
            }
            is Result.Failure -> result
        }
    }

    override fun observeMessages(sessionId: String): Flow<List<Message>> {
        return messageDao.observeBySessionId(sessionId).map { entities ->
            entities.map { it.toDomainModel(json) }
        }
    }

    // Managed repos
    override suspend fun getManagedRepos(workspaceId: String): NetworkResult<List<ManagedRepo>> {
        return when (val result = api.listManagedRepos(workspaceId)) {
            is Result.Success -> Result.Success(result.value.repos)
            is Result.Failure -> result
        }
    }
}
