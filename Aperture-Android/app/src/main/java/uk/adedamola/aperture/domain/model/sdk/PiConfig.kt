package uk.adedamola.aperture.domain.model.sdk

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import uk.adedamola.aperture.domain.model.AgentType
import uk.adedamola.aperture.domain.model.PiProvider
import uk.adedamola.aperture.domain.model.PiSessionMode
import uk.adedamola.aperture.domain.model.PiThinkingLevel
import uk.adedamola.aperture.domain.model.PiToolSet

@Serializable
data class PiModelConfig(
    val provider: PiProvider,
    val modelId: String
)

@Serializable
data class PiSessionConfig(
    val sessionMode: PiSessionMode? = null,
    val sessionPath: String? = null,
    val agentDir: String? = null,
    val model: PiModelConfig? = null,
    val thinkingLevel: PiThinkingLevel? = null,
    val scopedModels: List<PiModelConfig>? = null,
    val toolSet: PiToolSet? = null,
    val customTools: List<String>? = null,
    val systemPromptOverride: String? = null,
    val skillsOverride: List<String>? = null,
    val extensionPaths: List<String>? = null,
    val autoCompaction: Boolean? = null,
    val autoRetry: Boolean? = null,
    val maxRetries: Int? = null,
    val streamingBehavior: String? = null // 'steer' | 'followUp'
)

@Serializable
data class PiSessionStats(
    val inputTokens: Int,
    val outputTokens: Int,
    val totalCost: Double,
    val turnCount: Int,
    val modelId: String? = null,
    val provider: String? = null
)

@Serializable
data class PiModelInfo(
    val provider: PiProvider,
    val modelId: String,
    val displayName: String,
    val supportsThinking: Boolean,
    val contextWindow: Int? = null,
    val maxOutputTokens: Int? = null
)

@Serializable
data class PiForkableEntry(
    val id: String,
    val type: String = "user_message",
    val content: String,
    val timestamp: Long
)

@Serializable
data class PiSessionEntry(
    val id: String,
    val parentId: String? = null,
    val type: String, // PiSessionEntryType
    val timestamp: Long,
    val data: JsonElement? = null
)

@Serializable
data class PiSessionTree(
    val entries: List<PiSessionEntry>,
    val leafId: String,
    val branches: Map<String, List<String>>, // parentId -> childIds
    val labels: Map<String, String> // entryId -> label
)

@Serializable
data class PiSessionStatus(
    val id: String,
    val agent: AgentType = AgentType.PI_SDK,
    val authMode: String,
    val running: Boolean,
    val pendingRequests: Int,
    val lastActivityTime: Long,
    val idleMs: Long,
    val piSessionPath: String? = null,
    val isResumable: Boolean = false,
    val workingDirectory: String? = null,
    val thinkingLevel: PiThinkingLevel? = null,
    val currentModel: PiModelConfig? = null,
    val isStreaming: Boolean = false
)

// Pi Event types for streaming
@Serializable
enum class PiEventType {
    @SerialName("message_update") MESSAGE_UPDATE,
    @SerialName("tool_execution_start") TOOL_EXECUTION_START,
    @SerialName("tool_execution_update") TOOL_EXECUTION_UPDATE,
    @SerialName("tool_execution_end") TOOL_EXECUTION_END,
    @SerialName("message_start") MESSAGE_START,
    @SerialName("message_end") MESSAGE_END,
    @SerialName("agent_start") AGENT_START,
    @SerialName("agent_end") AGENT_END,
    @SerialName("turn_start") TURN_START,
    @SerialName("turn_end") TURN_END,
    @SerialName("auto_compaction_start") AUTO_COMPACTION_START,
    @SerialName("auto_compaction_end") AUTO_COMPACTION_END,
    @SerialName("auto_retry_start") AUTO_RETRY_START,
    @SerialName("auto_retry_end") AUTO_RETRY_END,
    @SerialName("extension_error") EXTENSION_ERROR
}

@Serializable
enum class PiDeltaType {
    @SerialName("text_start") TEXT_START,
    @SerialName("text_delta") TEXT_DELTA,
    @SerialName("text_end") TEXT_END,
    @SerialName("thinking_start") THINKING_START,
    @SerialName("thinking_delta") THINKING_DELTA,
    @SerialName("thinking_end") THINKING_END,
    @SerialName("toolcall_start") TOOLCALL_START,
    @SerialName("toolcall_delta") TOOLCALL_DELTA,
    @SerialName("toolcall_end") TOOLCALL_END,
    @SerialName("start") START,
    @SerialName("done") DONE,
    @SerialName("error") ERROR
}

// Pi streaming payloads
@Serializable
data class PiMessageUpdatePayload(
    val type: String = "message_update",
    val assistantMessageEvent: PiAssistantMessageEvent
)

@Serializable
data class PiAssistantMessageEvent(
    val type: PiDeltaType,
    val delta: String? = null,
    val toolCallId: String? = null,
    val toolName: String? = null,
    val inputJson: String? = null,
    val error: String? = null
)

@Serializable
data class PiToolExecutionStartPayload(
    val type: String = "tool_execution_start",
    val toolName: String,
    val toolCallId: String,
    val input: Map<String, JsonElement>
)

@Serializable
data class PiToolExecutionEndPayload(
    val type: String = "tool_execution_end",
    val toolName: String,
    val toolCallId: String,
    val result: JsonElement? = null,
    val error: String? = null,
    val isError: Boolean
)

@Serializable
data class PiAgentStartPayload(
    val type: String = "agent_start"
)

@Serializable
data class PiAgentEndPayload(
    val type: String = "agent_end",
    val result: String? = null,
    val error: String? = null
)

@Serializable
data class PiCompactionStartPayload(
    val type: String = "auto_compaction_start",
    val preTokens: Int
)

@Serializable
data class PiCompactionEndPayload(
    val type: String = "auto_compaction_end",
    val preTokens: Int,
    val postTokens: Int
)

// Pi streaming state
data class PiStreamingState(
    val messageId: String,
    val contentBlocks: List<uk.adedamola.aperture.domain.model.PiContentBlock>,
    val currentBlockIndex: Int,
    val isStreaming: Boolean
)
