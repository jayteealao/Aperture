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
 */
@Serializable
sealed class OutboundMessage {
    abstract val type: String

    @Serializable
    @SerialName("user_message")
    data class UserMessage(
        override val type: String = "user_message",
        val content: String,
        val images: List<ImageAttachment>? = null,
        val toolsAllowed: Boolean? = null,
        val requireApprovals: Boolean? = null
    ) : OutboundMessage()

    @Serializable
    @SerialName("permission_response")
    data class PermissionResponse(
        override val type: String = "permission_response",
        val toolCallId: String,
        val optionId: String?,
        val answers: Map<String, String>? = null
    ) : OutboundMessage()

    @Serializable
    @SerialName("cancel")
    data class Cancel(
        override val type: String = "cancel"
    ) : OutboundMessage()

    @Serializable
    @SerialName("interrupt")
    data class Interrupt(
        override val type: String = "interrupt"
    ) : OutboundMessage()

    @Serializable
    @SerialName("set_permission_mode")
    data class SetPermissionMode(
        override val type: String = "set_permission_mode",
        val mode: PermissionMode
    ) : OutboundMessage()

    @Serializable
    @SerialName("set_model")
    data class SetModel(
        override val type: String = "set_model",
        val model: String?
    ) : OutboundMessage()

    @Serializable
    @SerialName("set_thinking_tokens")
    data class SetThinkingTokens(
        override val type: String = "set_thinking_tokens",
        val tokens: Int?
    ) : OutboundMessage()

    @Serializable
    @SerialName("rewind_files")
    data class RewindFiles(
        override val type: String = "rewind_files",
        val messageId: String,
        val dryRun: Boolean? = null
    ) : OutboundMessage()

    @Serializable
    @SerialName("get_mcp_status")
    data class GetMcpStatus(
        override val type: String = "get_mcp_status"
    ) : OutboundMessage()

    @Serializable
    @SerialName("set_mcp_servers")
    data class SetMcpServers(
        override val type: String = "set_mcp_servers",
        val servers: Map<String, McpServerConfig>
    ) : OutboundMessage()

    @Serializable
    @SerialName("get_account_info")
    data class GetAccountInfo(
        override val type: String = "get_account_info"
    ) : OutboundMessage()

    @Serializable
    @SerialName("get_supported_models")
    data class GetSupportedModels(
        override val type: String = "get_supported_models"
    ) : OutboundMessage()

    @Serializable
    @SerialName("get_supported_commands")
    data class GetSupportedCommands(
        override val type: String = "get_supported_commands"
    ) : OutboundMessage()

    @Serializable
    @SerialName("update_config")
    data class UpdateConfig(
        override val type: String = "update_config",
        val config: SdkSessionConfig
    ) : OutboundMessage()
}

/**
 * Pi SDK Outbound messages
 */
@Serializable
sealed class PiOutboundMessage {
    abstract val type: String

    @Serializable
    @SerialName("user_message")
    data class UserMessage(
        override val type: String = "user_message",
        val content: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_steer")
    data class Steer(
        override val type: String = "pi_steer",
        val content: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_follow_up")
    data class FollowUp(
        override val type: String = "pi_follow_up",
        val content: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_compact")
    data class Compact(
        override val type: String = "pi_compact",
        val instructions: String? = null
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_fork")
    data class Fork(
        override val type: String = "pi_fork",
        val entryId: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_navigate")
    data class Navigate(
        override val type: String = "pi_navigate",
        val entryId: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_set_model")
    data class SetModel(
        override val type: String = "pi_set_model",
        val provider: String,
        val modelId: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_cycle_model")
    data class CycleModel(
        override val type: String = "pi_cycle_model"
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_set_thinking_level")
    data class SetThinkingLevel(
        override val type: String = "pi_set_thinking_level",
        val level: String
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_cycle_thinking")
    data class CycleThinking(
        override val type: String = "pi_cycle_thinking"
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_new_session")
    data class NewSession(
        override val type: String = "pi_new_session"
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_tree")
    data class GetTree(
        override val type: String = "pi_get_tree"
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_forkable")
    data class GetForkable(
        override val type: String = "pi_get_forkable"
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_stats")
    data class GetStats(
        override val type: String = "pi_get_stats"
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("pi_get_models")
    data class GetModels(
        override val type: String = "pi_get_models"
    ) : PiOutboundMessage()

    @Serializable
    @SerialName("cancel")
    data class Cancel(
        override val type: String = "cancel"
    ) : PiOutboundMessage()
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
    val sessionUpdate: String,
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
