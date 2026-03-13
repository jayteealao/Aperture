package uk.adedamola.aperture.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ManagedRepo(
    val id: String,
    val name: String,
    val path: String,
    val originUrl: String? = null,
    val workspaceId: String,
    val createdAt: Long,
    val sessionId: String? = null
)
