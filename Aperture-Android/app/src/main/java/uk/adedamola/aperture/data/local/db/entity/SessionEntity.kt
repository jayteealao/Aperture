package uk.adedamola.aperture.data.local.db.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import uk.adedamola.aperture.domain.model.AgentType
import uk.adedamola.aperture.domain.model.SessionStatus

@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey
    val id: String,
    val agent: String, // AgentType serialized
    val authMode: String,
    val running: Boolean,
    val pendingRequests: Int,
    val lastActivityTime: Long,
    val idleMs: Long,
    val acpSessionId: String?,
    val sdkSessionId: String?,
    val piSessionPath: String?,
    val isResumable: Boolean?,
    val workingDirectory: String?,
    val thinkingLevel: String?,
    val cachedAt: Long = System.currentTimeMillis()
) {
    fun toDomainModel(): SessionStatus = SessionStatus(
        id = id,
        agent = AgentType.valueOf(agent),
        authMode = authMode,
        running = running,
        pendingRequests = pendingRequests,
        lastActivityTime = lastActivityTime,
        idleMs = idleMs,
        acpSessionId = acpSessionId,
        sdkSessionId = sdkSessionId,
        piSessionPath = piSessionPath,
        isResumable = isResumable,
        workingDirectory = workingDirectory,
        thinkingLevel = thinkingLevel
    )

    companion object {
        fun fromDomainModel(status: SessionStatus): SessionEntity = SessionEntity(
            id = status.id,
            agent = status.agent.name,
            authMode = status.authMode,
            running = status.running,
            pendingRequests = status.pendingRequests,
            lastActivityTime = status.lastActivityTime,
            idleMs = status.idleMs,
            acpSessionId = status.acpSessionId,
            sdkSessionId = status.sdkSessionId,
            piSessionPath = status.piSessionPath,
            isResumable = status.isResumable,
            workingDirectory = status.workingDirectory,
            thinkingLevel = status.thinkingLevel
        )
    }
}
