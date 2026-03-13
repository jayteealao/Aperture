package uk.adedamola.aperture.data.remote.api

import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.WebSocketSession
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import uk.adedamola.aperture.core.util.exponentialBackoff
import uk.adedamola.aperture.domain.model.ConnectionStatus
import uk.adedamola.aperture.BuildConfig
import uk.adedamola.aperture.domain.model.websocket.OutboundMessage
import uk.adedamola.aperture.domain.model.websocket.PiOutboundMessage
import android.util.Log
import javax.inject.Inject
import javax.inject.Singleton

data class SessionConnection(
    val sessionId: String,
    var session: WebSocketSession? = null,
    var connectionJob: Job? = null,
    var receiveJob: Job? = null,
    var retryCount: Int = 0,
    var lastError: String? = null
)

@Singleton
class WebSocketManager @Inject constructor(
    private val client: HttpClient,
    private val json: Json
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val connections = mutableMapOf<String, SessionConnection>()
    private val connectionsMutex = Mutex()

    private val _connectionStatus = MutableStateFlow<Map<String, ConnectionStatus>>(emptyMap())
    val connectionStatus: StateFlow<Map<String, ConnectionStatus>> = _connectionStatus.asStateFlow()

    private val _inboundMessages = MutableSharedFlow<Pair<String, String>>(
        replay = 0,
        extraBufferCapacity = 100
    )
    val inboundMessages: SharedFlow<Pair<String, String>> = _inboundMessages.asSharedFlow()

    private var baseUrl: String = ""
    private var apiToken: String = ""

    companion object {
        private const val TAG = "WebSocketManager"
        private const val MAX_CONNECTIONS = 10
        private const val BASE_RETRY_DELAY_MS = 1000L
        private const val MAX_RETRY_DELAY_MS = 30000L
        private const val MAX_RETRIES = 20

        // Close codes that should not trigger retry
        private val NON_RETRYABLE_CODES = setOf(
            1003, // Unsupported data
            1008, // Policy violation
        ) + (4000..4999).toSet() // Application-specific codes
    }

    fun configure(baseUrl: String, token: String) {
        this.baseUrl = baseUrl.trimEnd('/').replace("http", "ws")
        this.apiToken = token
    }

    suspend fun connect(sessionId: String): Result<Unit> {
        return connectionsMutex.withLock {
            // Check max connections
            if (connections.size >= MAX_CONNECTIONS && !connections.containsKey(sessionId)) {
                return@withLock Result.failure(
                    IllegalStateException("Max connections ($MAX_CONNECTIONS) reached")
                )
            }

            // Get or create connection
            val connection = connections.getOrPut(sessionId) {
                SessionConnection(sessionId)
            }

            // If already connected, return success
            if (connection.session?.isActive == true) {
                return@withLock Result.success(Unit)
            }

            // Cancel any existing connection attempt
            connection.connectionJob?.cancel()
            connection.receiveJob?.cancel()

            updateStatus(sessionId, ConnectionStatus.CONNECTING)

            connection.connectionJob = scope.launch {
                try {
                    establishConnection(connection)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    handleConnectionError(connection, e)
                }
            }

            Result.success(Unit)
        }
    }

    private suspend fun establishConnection(connection: SessionConnection) {
        val wsUrl = "$baseUrl/v1/sessions/${connection.sessionId}/ws"

        val session = client.webSocketSession(wsUrl) {
            headers.append("Authorization", "Bearer $apiToken")
        }

        connectionsMutex.withLock {
            connection.session = session
            connection.retryCount = 0
            connection.lastError = null
        }

        updateStatus(connection.sessionId, ConnectionStatus.CONNECTED)

        // Start receiving messages
        connection.receiveJob = scope.launch {
            try {
                receiveMessages(connection, session)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                handleConnectionError(connection, e)
            }
        }
    }

    private suspend fun receiveMessages(
        connection: SessionConnection,
        session: WebSocketSession
    ) {
        try {
            for (frame in session.incoming) {
                when (frame) {
                    is Frame.Text -> {
                        val text = frame.readText()
                        _inboundMessages.emit(connection.sessionId to text)
                    }
                    is Frame.Close -> {
                        // Close frame received, exit the loop
                        break
                    }
                    else -> { /* Ignore other frame types */ }
                }
            }
        } finally {
            // Connection closed, handle cleanup
            handleClose(connection, null)
        }
    }

    private suspend fun handleClose(connection: SessionConnection, reason: CloseReason?) {
        val code = reason?.code?.toInt() ?: 1006

        connectionsMutex.withLock {
            connection.session = null
        }

        // Check if we should retry
        if (code in NON_RETRYABLE_CODES) {
            updateStatus(connection.sessionId, ConnectionStatus.ENDED)
            return
        }

        // Attempt reconnection
        attemptReconnect(connection)
    }

    private suspend fun handleConnectionError(connection: SessionConnection, error: Throwable) {
        connectionsMutex.withLock {
            connection.lastError = error.message
            connection.session = null
        }

        attemptReconnect(connection)
    }

    private suspend fun attemptReconnect(connection: SessionConnection) {
        val retryCount = connectionsMutex.withLock {
            connection.retryCount++
            connection.retryCount
        }

        if (retryCount > MAX_RETRIES) {
            updateStatus(connection.sessionId, ConnectionStatus.ERROR)
            return
        }

        updateStatus(connection.sessionId, ConnectionStatus.RECONNECTING)

        val delay = exponentialBackoff(
            attempt = retryCount,
            baseDelayMs = BASE_RETRY_DELAY_MS,
            maxDelayMs = MAX_RETRY_DELAY_MS
        )

        delay(delay)

        try {
            establishConnection(connection)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleConnectionError(connection, e)
        }
    }

    suspend fun disconnect(sessionId: String) {
        connectionsMutex.withLock {
            connections[sessionId]?.let { connection ->
                connection.connectionJob?.cancel()
                connection.receiveJob?.cancel()
                connection.session?.close(
                    CloseReason(CloseReason.Codes.NORMAL, "Client disconnect")
                )
                connections.remove(sessionId)
            }
        }
        updateStatus(sessionId, ConnectionStatus.DISCONNECTED)
    }

    suspend fun disconnectAll() {
        connectionsMutex.withLock {
            connections.values.forEach { connection ->
                connection.connectionJob?.cancel()
                connection.receiveJob?.cancel()
                connection.session?.close(
                    CloseReason(CloseReason.Codes.NORMAL, "Client disconnect")
                )
            }
            connections.clear()
        }
        _connectionStatus.value = emptyMap()
    }

    suspend fun send(sessionId: String, message: OutboundMessage): Boolean {
        val session = connectionsMutex.withLock {
            connections[sessionId]?.session
        }

        if (session == null || !session.isActive) {
            Log.e(TAG, "Cannot send: session null or inactive for $sessionId")
            return false
        }

        return try {
            val jsonString = json.encodeToString(OutboundMessage.serializer(), message)
            if (BuildConfig.DEBUG) Log.d(TAG, "Sending message: $jsonString")
            session.send(Frame.Text(jsonString))
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send message", e)
            false
        }
    }

    suspend fun sendPi(sessionId: String, message: PiOutboundMessage): Boolean {
        val session = connectionsMutex.withLock {
            connections[sessionId]?.session
        }

        if (session == null || !session.isActive) {
            Log.e(TAG, "Cannot send Pi: session null or inactive for $sessionId")
            return false
        }

        return try {
            val jsonString = json.encodeToString(PiOutboundMessage.serializer(), message)
            if (BuildConfig.DEBUG) Log.d(TAG, "Sending Pi message: $jsonString")
            session.send(Frame.Text(jsonString))
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send Pi message", e)
            false
        }
    }

    fun getStatus(sessionId: String): ConnectionStatus {
        return _connectionStatus.value[sessionId] ?: ConnectionStatus.DISCONNECTED
    }

    fun isConnected(sessionId: String): Boolean {
        return getStatus(sessionId) == ConnectionStatus.CONNECTED
    }

    private fun updateStatus(sessionId: String, status: ConnectionStatus) {
        _connectionStatus.value = _connectionStatus.value.toMutableMap().apply {
            if (status == ConnectionStatus.DISCONNECTED) {
                remove(sessionId)
            } else {
                put(sessionId, status)
            }
        }
    }
}
