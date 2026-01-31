package uk.adedamola.aperture.data.local.db.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import uk.adedamola.aperture.domain.model.ContentBlock
import uk.adedamola.aperture.domain.model.Message
import uk.adedamola.aperture.domain.model.MessageContent
import uk.adedamola.aperture.domain.model.MessageRole
import uk.adedamola.aperture.domain.model.ToolCall

@Entity(
    tableName = "messages",
    indices = [
        Index(value = ["sessionId"]),
        Index(value = ["timestamp"])
    ]
)
data class MessageEntity(
    @PrimaryKey
    val id: String,
    val sessionId: String,
    val role: String,
    val contentJson: String, // Serialized content blocks or text
    val contentType: String, // "text" or "blocks"
    val timestamp: String,
    val toolCallsJson: String?, // Serialized tool calls
    val cachedAt: Long = System.currentTimeMillis()
) {
    fun toDomainModel(json: Json): Message {
        val content = when (contentType) {
            "text" -> MessageContent.Text(contentJson)
            "blocks" -> MessageContent.Blocks(
                json.decodeFromString<List<ContentBlock>>(contentJson)
            )
            else -> MessageContent.Text(contentJson)
        }

        val toolCalls = toolCallsJson?.let {
            json.decodeFromString<List<ToolCall>>(it)
        }

        return Message(
            id = id,
            sessionId = sessionId,
            role = MessageRole.valueOf(role),
            content = content,
            timestamp = timestamp,
            toolCalls = toolCalls
        )
    }

    companion object {
        fun fromDomainModel(message: Message, json: Json): MessageEntity {
            val (contentJson, contentType) = when (val content = message.content) {
                is MessageContent.Text -> content.text to "text"
                is MessageContent.Blocks -> json.encodeToString(content.blocks) to "blocks"
            }

            val toolCallsJson = message.toolCalls?.let {
                json.encodeToString(it)
            }

            return MessageEntity(
                id = message.id,
                sessionId = message.sessionId ?: "",
                role = message.role.name,
                contentJson = contentJson,
                contentType = contentType,
                timestamp = message.timestamp,
                toolCallsJson = toolCallsJson
            )
        }
    }
}
