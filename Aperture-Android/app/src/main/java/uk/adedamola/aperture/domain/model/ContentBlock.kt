package uk.adedamola.aperture.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Sealed class representing different types of content blocks in messages.
 * Discriminated by the "type" field in JSON.
 */
@Serializable
sealed class ContentBlock {
    abstract val type: String

    @Serializable
    @SerialName("text")
    data class Text(
        override val type: String = "text",
        val text: String
    ) : ContentBlock()

    @Serializable
    @SerialName("thinking")
    data class Thinking(
        override val type: String = "thinking",
        val thinking: String,
        val signature: String? = null
    ) : ContentBlock()

    @Serializable
    @SerialName("tool_use")
    data class ToolUse(
        override val type: String = "tool_use",
        val id: String,
        val name: String,
        val input: JsonElement? = null
    ) : ContentBlock()

    @Serializable
    @SerialName("tool_result")
    data class ToolResult(
        override val type: String = "tool_result",
        @SerialName("tool_use_id")
        val toolUseId: String,
        val content: String,
        @SerialName("is_error")
        val isError: Boolean = false
    ) : ContentBlock()

    @Serializable
    @SerialName("image")
    data class Image(
        override val type: String = "image",
        val mimeType: String,
        val data: String, // Base64 encoded
        val filename: String? = null
    ) : ContentBlock()
}

/**
 * Pi SDK specific content blocks
 */
@Serializable
sealed class PiContentBlock {
    abstract val type: String

    @Serializable
    @SerialName("text")
    data class Text(
        override val type: String = "text",
        val text: String
    ) : PiContentBlock()

    @Serializable
    @SerialName("thinking")
    data class Thinking(
        override val type: String = "thinking",
        val thinking: String
    ) : PiContentBlock()

    @Serializable
    @SerialName("tool_call")
    data class ToolCall(
        override val type: String = "tool_call",
        val id: String,
        val name: String,
        val input: String // JSON string
    ) : PiContentBlock()
}
