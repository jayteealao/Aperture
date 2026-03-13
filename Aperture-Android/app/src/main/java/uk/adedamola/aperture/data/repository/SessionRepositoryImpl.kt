package uk.adedamola.aperture.data.repository

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
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
import uk.adedamola.aperture.domain.model.websocket.PiAssistantMessageEvent
import uk.adedamola.aperture.domain.model.websocket.PiMessagePayload
import uk.adedamola.aperture.domain.model.websocket.SdkMessagePayload
import uk.adedamola.aperture.domain.model.websocket.SessionUpdateParams
import uk.adedamola.aperture.domain.model.websocket.WsInboundMessage
import uk.adedamola.aperture.domain.repository.SessionRepository
import java.io.Closeable
import java.security.MessageDigest
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRepositoryImpl @Inject constructor(
    private val api: ApertureApi,
    private val sessionDao: SessionDao,
    private val messageDao: MessageDao,
    private val webSocketManager: WebSocketManager,
    private val json: Json
) : SessionRepository, Closeable {

    companion object {
        private const val TAG = "SessionRepositoryImpl"

        // SDK (Claude) streaming update types
        private val SDK_STREAMING_START_TYPES = setOf(
            "init", "init_tool", "progress", "thinking", "tool_output",
            "content_block_start", "agent_message_chunk", "assistant_delta"
        )
        private val SDK_STREAMING_END_TYPES = setOf(
            "result", "ended", "error",
            "content_block_stop", "agent_message_complete", "prompt_complete", "assistant_message"
        )

        // Pi SDK streaming update types
        private val PI_STREAMING_START_TYPES = setOf(
            "message_update", "turn_start", "tool_execution_start"
        )
        private val PI_STREAMING_END_TYPES = setOf(
            "turn_end", "tool_execution_end", "message_end"
        )

    }

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
            // First, try to parse as kind-discriminated message (sdk/pi)
            val wrapper = try {
                json.decodeFromString<WsInboundMessage>(rawJson)
            } catch (e: Exception) {
                null
            }

            if (wrapper != null) {
                when (wrapper) {
                    is WsInboundMessage.Sdk -> processSdkMessage(sessionId, wrapper)
                    is WsInboundMessage.Pi -> processPiMessage(sessionId, wrapper)
                }
                return
            }

            // Fallback to legacy JsonRPC format
            processJsonRpcMessage(sessionId, rawJson)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to process inbound message", e)
        }
    }

    /**
     * Process Claude SDK messages (kind: "sdk")
     */
    private suspend fun processSdkMessage(sessionId: String, msg: WsInboundMessage.Sdk) {
        Log.d(TAG, "SDK message: type=${msg.type}, sessionId=$sessionId")

        when (msg.type) {
            "session_update", "assistant_delta", "assistant_message" -> {
                try {
                    val payload = json.decodeFromJsonElement<SdkMessagePayload>(msg.payload)
                    val content = payload.content
                    val updateType = payload.sessionUpdate.ifEmpty { msg.type }

                    Log.d(TAG, "SDK update type: $updateType, hasContent: ${content != null}")

                    if (content != null) {
                        val messageId = generateDeterministicMessageId(sessionId, content)
                        val message = Message(
                            id = messageId,
                            sessionId = sessionId,
                            role = MessageRole.ASSISTANT,
                            content = MessageContent.Blocks(listOf(content)),
                            timestamp = Instant.now().toString()
                        )
                        messageDao.insert(MessageEntity.fromDomainModel(message, json))
                        Log.d(TAG, "Saved SDK message: ${message.id}")
                    }

                    updateStreamingState(sessionId, updateType, isSdk = true)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse SDK message payload", e)
                }
            }
            "session_exit" -> {
                updateStreamingState(sessionId, "ended", isSdk = true)
            }
            "session_error" -> {
                Log.e(TAG, "SDK session error: ${msg.payload}")
                updateStreamingState(sessionId, "error", isSdk = true)
            }
            else -> {
                Log.d(TAG, "Unhandled SDK message type: ${msg.type}")
            }
        }
    }

    /**
     * Process Pi SDK messages (kind: "pi")
     */
    private suspend fun processPiMessage(sessionId: String, msg: WsInboundMessage.Pi) {
        Log.d(TAG, "Pi message: type=${msg.type}, sessionId=$sessionId")

        when (msg.type) {
            "message_update" -> {
                try {
                    val payload = json.decodeFromJsonElement<PiMessagePayload>(msg.payload)
                    val event = payload.assistantMessageEvent

                    Log.d(TAG, "Pi message_update: eventType=${event?.type}, hasEvent: ${event != null}")

                    if (event != null) {
                        processPiAssistantEvent(sessionId, event)
                    }

                    updateStreamingState(sessionId, msg.type, isSdk = false)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse Pi message_update payload", e)
                }
            }
            "turn_start" -> {
                Log.d(TAG, "Pi turn started for session: $sessionId")
                updateStreamingState(sessionId, "turn_start", isSdk = false)
            }
            "turn_end" -> {
                Log.d(TAG, "Pi turn ended for session: $sessionId")
                updateStreamingState(sessionId, "turn_end", isSdk = false)
            }
            "tool_execution_start" -> {
                updateStreamingState(sessionId, "tool_execution_start", isSdk = false)
            }
            "tool_execution_end" -> {
                updateStreamingState(sessionId, "tool_execution_end", isSdk = false)
            }
            "error" -> {
                Log.e(TAG, "Pi session error: ${msg.payload}")
                updateStreamingState(sessionId, "error", isSdk = false)
            }
            else -> {
                Log.d(TAG, "Unhandled Pi message type: ${msg.type}")
            }
        }
    }

    /**
     * Process Pi assistant message events (text_delta, thinking_delta, toolcall_*)
     */
    private suspend fun processPiAssistantEvent(sessionId: String, event: PiAssistantMessageEvent) {
        when (event.type) {
            "text_delta" -> {
                val delta = event.delta ?: return
                val content = ContentBlock.TextDelta(text = delta)
                val messageId = generateDeterministicMessageId(sessionId, content)
                val message = Message(
                    id = messageId,
                    sessionId = sessionId,
                    role = MessageRole.ASSISTANT,
                    content = MessageContent.Blocks(listOf(content)),
                    timestamp = Instant.now().toString()
                )
                messageDao.insert(MessageEntity.fromDomainModel(message, json))
                Log.d(TAG, "Saved Pi text delta: ${delta.take(50)}...")
            }
            "thinking_delta" -> {
                val delta = event.delta ?: return
                val content = ContentBlock.Thinking(thinking = delta)
                val messageId = generateDeterministicMessageId(sessionId, content)
                val message = Message(
                    id = messageId,
                    sessionId = sessionId,
                    role = MessageRole.ASSISTANT,
                    content = MessageContent.Blocks(listOf(content)),
                    timestamp = Instant.now().toString()
                )
                messageDao.insert(MessageEntity.fromDomainModel(message, json))
                Log.d(TAG, "Saved Pi thinking delta")
            }
            "toolcall_start", "toolcall_delta", "toolcall_end" -> {
                // Tool call handling - convert to ToolUse block
                val toolCallId = event.toolCallId ?: return
                val toolName = event.toolName ?: "unknown_tool"
                val inputJson = event.inputJson

                // Parse input JSON if provided
                val input = if (inputJson != null) {
                    try {
                        json.parseToJsonElement(inputJson)
                    } catch (e: Exception) {
                        null
                    }
                } else null

                val content = ContentBlock.ToolUse(
                    id = toolCallId,
                    name = toolName,
                    input = input
                )
                val messageId = generateDeterministicMessageId(sessionId, content)
                val message = Message(
                    id = messageId,
                    sessionId = sessionId,
                    role = MessageRole.ASSISTANT,
                    content = MessageContent.Blocks(listOf(content)),
                    timestamp = Instant.now().toString()
                )
                messageDao.insert(MessageEntity.fromDomainModel(message, json))
                Log.d(TAG, "Saved Pi tool call: $toolName (${event.type})")
            }
            else -> {
                Log.d(TAG, "Unhandled Pi assistant event type: ${event.type}")
            }
        }
    }

    /**
     * Process legacy JsonRPC format messages (for backwards compatibility)
     */
    private suspend fun processJsonRpcMessage(sessionId: String, rawJson: String) {
        val jsonRpc = json.decodeFromString<JsonRpcMessage>(rawJson)
        Log.d(TAG, "Legacy JsonRPC message: method=${jsonRpc.method}, sessionId=$sessionId")

        when (jsonRpc.method) {
            "session/update" -> {
                if (jsonRpc.params != null) {
                    try {
                        val params = json.decodeFromJsonElement<SessionUpdateParams>(jsonRpc.params)
                        val content = params.update.content
                        val updateType = params.update.sessionUpdate

                        Log.d(TAG, "Session update type: $updateType, hasContent: ${content != null}")

                        if (content != null) {
                            val messageId = generateDeterministicMessageId(sessionId, content)
                            val message = Message(
                                id = messageId,
                                sessionId = sessionId,
                                role = MessageRole.ASSISTANT,
                                content = MessageContent.Blocks(listOf(content)),
                                timestamp = Instant.now().toString()
                            )
                            messageDao.insert(MessageEntity.fromDomainModel(message, json))
                            Log.d(TAG, "Saved message: ${message.id}")
                        }

                        updateStreamingState(sessionId, updateType, isSdk = true)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to parse session/update params", e)
                    }
                }
            }
            "session/exit" -> {
                updateStreamingState(sessionId, "ended", isSdk = true)
            }
            "session/error" -> {
                Log.e(TAG, "Session error: ${jsonRpc.params}")
                updateStreamingState(sessionId, "error", isSdk = true)
            }
        }
    }

    /**
     * Generate a deterministic message ID based on session and content.
     * The same session + content always produces the same ID, which prevents
     * duplicate messages on WebSocket reconnection replays.
     */
    private fun generateDeterministicMessageId(sessionId: String, content: ContentBlock): String {
        val contentJson = json.encodeToString(content)
        val input = "$sessionId:$contentJson"
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(input.toByteArray())
        return hash.take(16).joinToString("") { "%02x".format(it) }
    }

    private fun updateStreamingState(sessionId: String, updateType: String, isSdk: Boolean = true) {
        val currentStates = _connectionStates.value.toMutableMap()
        val existing = currentStates[sessionId] ?: ConnectionState()

        val (startTypes, endTypes) = if (isSdk) {
            SDK_STREAMING_START_TYPES to SDK_STREAMING_END_TYPES
        } else {
            PI_STREAMING_START_TYPES to PI_STREAMING_END_TYPES
        }

        val isStreaming = when {
            updateType in startTypes -> true
            updateType in endTypes -> false
            updateType == "error" -> false  // Errors always end streaming
            else -> {
                // Unknown update type - log it and default to streaming active
                // This ensures new update types from backend don't break the UI
                val kind = if (isSdk) "SDK" else "Pi"
                Log.w(TAG, "Unknown $kind streaming update type: $updateType, defaulting to streaming=true")
                true
            }
        }

        currentStates[sessionId] = existing.copy(
            isStreaming = isStreaming,
            lastActivity = System.currentTimeMillis()
        )
        _connectionStates.value = currentStates
    }

    /**
     * Clean up coroutine scope when repository is no longer needed.
     *
     * Lifecycle note: This repository is a @Singleton managed by Hilt.
     * The scope is cancelled automatically when the application process terminates.
     * For normal app usage, explicit close() calls are not required - the singleton
     * lives for the duration of the application component and is cleaned up on process death.
     */
    override fun close() {
        scope.cancel()
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
                deleteSessionLocally(sessionId)
                refreshSessions()
                Result.Success(Unit)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun deleteSessionLocally(sessionId: String) {
        sessionDao.deleteById(sessionId)
        messageDao.deleteBySessionId(sessionId)
        webSocketManager.disconnect(sessionId)
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

    override suspend fun saveUserMessage(sessionId: String, content: String): Message {
        val messageId = "user-${java.util.UUID.randomUUID()}"
        val message = Message(
            id = messageId,
            sessionId = sessionId,
            role = MessageRole.USER,
            content = MessageContent.Text(content),
            timestamp = Instant.now().toString()
        )
        messageDao.insert(MessageEntity.fromDomainModel(message, json))
        return message
    }

    // Managed repos
    override suspend fun getManagedRepos(workspaceId: String): NetworkResult<List<ManagedRepo>> {
        return when (val result = api.listManagedRepos(workspaceId)) {
            is Result.Success -> Result.Success(result.value.repos)
            is Result.Failure -> result
        }
    }
}
