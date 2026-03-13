package uk.adedamola.aperture.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Sealed class representing different types of content blocks in messages.
 * Discriminated by the "type" field in JSON via kotlinx.serialization.
 * Note: Don't declare a `type` property - it conflicts with the JSON class discriminator.
 */
@Serializable
sealed class ContentBlock {

    @Serializable
    @SerialName("text")
    data class Text(
        val text: String
    ) : ContentBlock()

    @Serializable
    @SerialName("text_delta")
    data class TextDelta(
        val text: String
    ) : ContentBlock()

    @Serializable
    @SerialName("thinking")
    data class Thinking(
        val thinking: String,
        val signature: String? = null
    ) : ContentBlock()

    @Serializable
    @SerialName("tool_use")
    data class ToolUse(
        val id: String,
        val name: String,
        val input: JsonElement? = null
    ) : ContentBlock()

    @Serializable
    @SerialName("tool_result")
    data class ToolResult(
        @SerialName("tool_use_id")
        val toolUseId: String,
        val content: String,
        @SerialName("is_error")
        val isError: Boolean = false
    ) : ContentBlock()

    @Serializable
    @SerialName("image")
    data class Image(
        val mimeType: String,
        val data: String, // Base64 encoded
        val filename: String? = null
    ) : ContentBlock()
}

/**
 * Pi SDK specific content blocks.
 * Note: Don't declare a `type` property - it conflicts with the JSON class discriminator.
 */
@Serializable
sealed class PiContentBlock {

    @Serializable
    @SerialName("text")
    data class Text(
        val text: String
    ) : PiContentBlock()

    @Serializable
    @SerialName("thinking")
    data class Thinking(
        val thinking: String
    ) : PiContentBlock()

    @Serializable
    @SerialName("tool_call")
    data class ToolCall(
        val id: String,
        val name: String,
        val input: String // JSON string
    ) : PiContentBlock()
}
