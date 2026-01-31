package uk.adedamola.aperture.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class Message(
    val id: String,
    val sessionId: String? = null,
    val role: MessageRole,
    val content: MessageContent,
    val timestamp: String,
    val toolCalls: List<ToolCall>? = null
)

/**
 * Message content can be a simple string or a list of content blocks
 */
@Serializable
sealed class MessageContent {
    @Serializable
    @SerialName("string")
    data class Text(val text: String) : MessageContent()

    @Serializable
    @SerialName("blocks")
    data class Blocks(val blocks: List<ContentBlock>) : MessageContent()
}

@Serializable
data class ToolCall(
    val toolCallId: String,
    val name: String,
    val input: JsonElement? = null,
    val title: String? = null,
    val rawInput: JsonElement? = null
)

@Serializable
data class ImageAttachment(
    val data: String, // Base64
    val mimeType: ImageMimeType,
    val filename: String? = null
)

object ImageLimits {
    const val MAX_COUNT = 5
    const val MAX_BYTES = 10 * 1024 * 1024 // 10MB
    val ALLOWED_MIME_TYPES = listOf(
        ImageMimeType.JPEG,
        ImageMimeType.PNG,
        ImageMimeType.GIF,
        ImageMimeType.WEBP
    )
}

/**
 * SDK-specific message with usage info
 */
@Serializable
data class SdkMessage(
    val id: String,
    val sessionId: String,
    val role: MessageRole,
    val content: List<ContentBlock>,
    val timestamp: String,
    val messageId: String? = null,
    val stopReason: String? = null,
    val usage: MessageUsage? = null
)

@Serializable
data class MessageUsage(
    @SerialName("input_tokens")
    val inputTokens: Int,
    @SerialName("output_tokens")
    val outputTokens: Int
)
