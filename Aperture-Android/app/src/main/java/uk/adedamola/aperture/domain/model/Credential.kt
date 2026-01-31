package uk.adedamola.aperture.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class Credential(
    val id: String,
    val provider: ProviderKey,
    val label: String,
    val createdAt: Long
)

@Serializable
data class CreateCredentialRequest(
    val provider: ProviderKey,
    val label: String,
    val apiKey: String
)
