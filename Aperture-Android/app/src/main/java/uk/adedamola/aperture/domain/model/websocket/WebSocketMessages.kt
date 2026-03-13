package uk.adedamola.aperture.domain.model.websocket

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import uk.adedamola.aperture.domain.model.ContentBlock
import uk.adedamola.aperture.domain.model.ImageAttachment
import uk.adedamola.aperture.domain.model.PermissionMode
import uk.adedamola.aperture.domain.model.ToolCall
import uk.adedamola.aperture.domain.model.sdk.McpServerConfig
import uk.adedamola.aperture.domain.model.sdk.PermissionOption
import uk.adedamola.aperture.domain.model.sdk.SdkSessionConfig

/**
 * Outbound messages (Client -> Server)
 * Note: The @SerialName annotation provides the "type" discriminator value automatically
 */
@Serializable
sealed class OutboundMessage {

    @Serializable
    @SerialName("user_message")
    data class UserMessage(
        val content: String,
        val images: List<ImageAttachment>? = null,
        val toolsAllowed: Boolean? = null,
        val requireApprovals: Boolean? = null
    ) : OutboundMessage()

    @Serializable
    @SerialName("permission_response")
    data class PermissionResponse(
        val toolCallId: String,
        val optionId: String?,
        val answers: Map<String, String>? = null
    ) : OutboundMessage()

    @Serializable
    @SerialName("cancel")
    object Cancel : OutboundMessage()

    @Serializable
    @SerialName("interrupt")
    object Interrupt : OutboundMessage()

    @Serializable
    @SerialName("set_permission_mode")
    data class SetPermissionMode(
        val mode: PermissionMode
    ) : OutboundMessage()

    @Serializable
    @SerialName("set_model")
    data class SetModel(
        val model: String?
    ) : OutboundMessage()

    @Serializable
    @SerialName("set_thinking_tokens")
    data class SetThinkingTokens(
        val tokens: Int?
    ) : OutboundMessage()

    @Serializable
    @SerialName("rewind_files")
    data class RewindFiles(
        val messageId: String,
        val dryRun: Boolean? = null
    ) : OutboundMessage()

    @Serializable
    @SerialName("get_mcp_status")
    object GetMcpStatus : OutboundMessage()

    @Serializable
    @SerialName("set_mcp_servers")
    data class SetMcpServers(
        val servers: Map<String, McpServerConfig>
    ) : OutboundMessage()

    @Serializable
    @SerialName("get_account_info")
    object GetAccountInfo : OutboundMessage()

    @Serializable
    @SerialName("get_supported_models")
    object GetSupportedModels : OutboundMessage()

    @Serializable
    @SerialName("get_supported_commands")
    object GetSupportedCommands : OutboundMessage()

    @Serializable
    @SerialName("update_config")
    data class UpdateConfig(
        val config: SdkSessionConfig
    ) : OutboundMessage()
}

/**
 * Pi SDK Outbound messages
 * Note: The @SerialName annotation provides the "type" discriminator value automatically
 */
@Serializable
sealed class PiOutboundMessage {

    @Serializable
    @SerialName("user_message")
    data class UserMessage(
        val content: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_steer")
    data class Steer(
        val content: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_follow_up")
    data class FollowUp(
        val content: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_compact")
    data class Compact(
        val instructions: String? = null
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_fork")
    data class Fork(
        val entryId: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_navigate")
    data class Navigate(
        val entryId: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_set_model")
    data class SetModel(
        val provider: String,
        val modelId: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_cycle_model")
    object CycleModel : PiOutboundMessage()

    @Serializable
    @SerialName("pi_set_thinking_level")
    data class SetThinkingLevel(
        val level: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_cycle_thinking")
    object CycleThinking : PiOutboundMessage()

    @Serializable
    @SerialName("pi_new_session")
    object NewSession : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_tree")
    object GetTree : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_forkable")
    object GetForkable : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_stats")
    object GetStats : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_models")
    object GetModels : PiOutboundMessage()

    @Serializable
    @SerialName("cancel")
    object Cancel : PiOutboundMessage()
}

/**
 * Inbound messages (Server -> Client)
 */
@Serializable
data class JsonRpcMessage(
    val jsonrpc: String = "2.0",
    val method: String? = null,
    val params: JsonElement? = null,
    val result: JsonElement? = null,
    val error: JsonRpcError? = null,
    val id: JsonElement? = null
)

@Serializable
data class JsonRpcError(
    val code: Int,
    val message: String
)

@Serializable
data class SessionUpdateParams(
    val update: SessionUpdateData
)

@Serializable
data class SessionUpdateData(
    val sessionUpdate: String = "",  // Default empty string for defensive parsing
    val content: ContentBlock? = null
)

@Serializable
data class PermissionRequestParams(
    val toolCallId: String,
    val toolCall: ToolCall,
    val options: List<PermissionOption>
)

/**
 * Wrapper for SDK/Pi WebSocket messages
 */
@Serializable
sealed class WsInboundMessage {
    @Serializable
    @SerialName("sdk")
    data class Sdk(
        val kind: String = "sdk",
        val sessionId: String,
        val type: String,
        val payload: JsonElement
    ) : WsInboundMessage()

    @Serializable
    @SerialName("pi")
    data class Pi(
        val kind: String = "pi",
        val sessionId: String,
        val type: String,
        val payload: JsonElement
    ) : WsInboundMessage()
}

/**
 * Pi SDK message payload types.
 * These represent the nested structure inside Pi messages.
 */
@Serializable
data class PiMessagePayload(
    val type: String,  // "message_update", "turn_start", "turn_end", etc.
    val assistantMessageEvent: PiAssistantMessageEvent? = null,
    val entryId: String? = null,
    val model: String? = null,
    val thinkingLevel: String? = null
)

/**
 * Pi SDK assistant message event containing streaming deltas.
 */
@Serializable
data class PiAssistantMessageEvent(
    val type: String,  // "text_delta", "thinking_delta", "toolcall_start", "toolcall_delta", "toolcall_end"
    val delta: String? = null,
    val toolCallId: String? = null,
    val toolName: String? = null,
    val inputJson: String? = null
)

/**
 * SDK message payload for Claude SDK session updates.
 */
@Serializable
data class SdkMessagePayload(
    val sessionUpdate: String = "",
    val content: ContentBlock? = null
)
