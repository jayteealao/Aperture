package uk.adedamola.aperture.domain.model.api

import kotlinx.serialization.Serializable
import uk.adedamola.aperture.domain.model.AgentType
import uk.adedamola.aperture.domain.model.Credential
import uk.adedamola.aperture.domain.model.ManagedRepo
import uk.adedamola.aperture.domain.model.Message
import uk.adedamola.aperture.domain.model.ResumableSession
import uk.adedamola.aperture.domain.model.SessionStatus
import uk.adedamola.aperture.domain.model.CheckoutRecord
import uk.adedamola.aperture.domain.model.WorkspaceRecord

@Serializable
data class HealthResponse(
    val status: String
)

@Serializable
data class ReadyResponse(
    val status: String,
    val claudePath: String? = null,
    val errors: List<String>? = null
)

@Serializable
data class ListSessionsResponse(
    val sessions: List<SessionStatus>,
    val total: Int
)

@Serializable
data class ListResumableSessionsResponse(
    val sessions: List<ResumableSession>,
    val total: Int
)

@Serializable
data class ConnectSessionResponse(
    val id: String,
    val agent: AgentType,
    val status: SessionStatus,
    val restored: Boolean
)

@Serializable
data class ListCredentialsResponse(
    val credentials: List<Credential>,
    val total: Int
)

@Serializable
data class MessagesResponse(
    val messages: List<Message>,
    val total: Int,
    val limit: Int,
    val offset: Int
)

@Serializable
data class ListWorkspacesResponse(
    val workspaces: List<WorkspaceRecord>,
    val total: Int
)

@Serializable
data class ListWorkspaceCheckoutsResponse(
    val checkouts: List<CheckoutRecord>
)

@Serializable
data class ListManagedReposResponse(
    val repos: List<ManagedRepo>,
    val total: Int
)
