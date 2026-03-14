package uk.adedamola.aperture.data.remote.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpStatusCode
import io.ktor.http.isSuccess
import uk.adedamola.aperture.core.util.NetworkError
import uk.adedamola.aperture.core.util.NetworkResult
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.domain.model.CloneWorkspaceRequest
import uk.adedamola.aperture.domain.model.CloneWorkspaceResponse
import uk.adedamola.aperture.domain.model.CreateCredentialRequest
import uk.adedamola.aperture.domain.model.CreateSessionRequest
import uk.adedamola.aperture.domain.model.CreateWorkspaceRequest
import uk.adedamola.aperture.domain.model.Credential
import uk.adedamola.aperture.domain.model.DiscoveryResult
import uk.adedamola.aperture.domain.model.Session
import uk.adedamola.aperture.domain.model.WorkspaceRecord
import uk.adedamola.aperture.domain.model.api.ConnectSessionResponse
import uk.adedamola.aperture.domain.model.api.HealthResponse
import uk.adedamola.aperture.domain.model.api.ListCredentialsResponse
import uk.adedamola.aperture.domain.model.api.ListResumableSessionsResponse
import uk.adedamola.aperture.domain.model.api.ListSessionsResponse
import uk.adedamola.aperture.domain.model.api.ListWorkspaceCheckoutsResponse
import uk.adedamola.aperture.domain.model.api.ListWorkspacesResponse
import uk.adedamola.aperture.domain.model.api.ListManagedReposResponse
import uk.adedamola.aperture.domain.model.api.MessagesResponse
import uk.adedamola.aperture.domain.model.api.ReadyResponse
import uk.adedamola.aperture.domain.model.ManagedRepo
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ApertureApi @Inject constructor(
    private val client: HttpClient
) {
    private var baseUrl: String = ""
    private var apiToken: String = ""

    fun configure(baseUrl: String, token: String) {
        this.baseUrl = baseUrl.trimEnd('/')
        this.apiToken = token
    }

    private fun authHeader() = "Bearer $apiToken"

    private suspend inline fun <reified T> safeCall(
        crossinline block: suspend () -> HttpResponse
    ): NetworkResult<T> = try {
        val response = block()
        if (response.status.isSuccess()) {
            // Handle Unit return type (for DELETE requests with 204 No Content)
            if (T::class == Unit::class) {
                @Suppress("UNCHECKED_CAST")
                Result.Success(Unit as T)
            } else {
                Result.Success(response.body())
            }
        } else {
            Result.Failure(
                NetworkError.HttpError(
                    response.status.value,
                    response.status.description
                )
            )
        }
    } catch (e: Exception) {
        when (e) {
            is java.net.SocketTimeoutException -> Result.Failure(NetworkError.TimeoutError(e))
            is java.net.ConnectException -> Result.Failure(NetworkError.ConnectionError(e))
            is kotlinx.serialization.SerializationException -> Result.Failure(NetworkError.ParseError(e))
            else -> Result.Failure(NetworkError.UnknownError(e))
        }
    }

    // Health endpoints (no auth required)
    suspend fun health(): NetworkResult<HealthResponse> = safeCall {
        client.get("$baseUrl/healthz")
    }

    suspend fun ready(): NetworkResult<ReadyResponse> = safeCall {
        client.get("$baseUrl/readyz")
    }

    // Session endpoints
    suspend fun listSessions(): NetworkResult<ListSessionsResponse> = safeCall {
        client.get("$baseUrl/v1/sessions") {
            header("Authorization", authHeader())
        }
    }

    suspend fun createSession(request: CreateSessionRequest): NetworkResult<Session> = safeCall {
        client.post("$baseUrl/v1/sessions") {
            header("Authorization", authHeader())
            setBody(request)
        }
    }

    suspend fun getSession(sessionId: String): NetworkResult<ConnectSessionResponse> = safeCall {
        client.get("$baseUrl/v1/sessions/$sessionId") {
            header("Authorization", authHeader())
        }
    }

    suspend fun deleteSession(sessionId: String): NetworkResult<Unit> = safeCall {
        client.delete("$baseUrl/v1/sessions/$sessionId") {
            header("Authorization", authHeader())
            headers.remove(io.ktor.http.HttpHeaders.ContentType)
        }
    }

    suspend fun listResumableSessions(): NetworkResult<ListResumableSessionsResponse> = safeCall {
        client.get("$baseUrl/v1/sessions/resumable") {
            header("Authorization", authHeader())
        }
    }

    // Messages endpoints
    suspend fun getMessages(
        sessionId: String,
        limit: Int = 50,
        offset: Int = 0
    ): NetworkResult<MessagesResponse> = safeCall {
        client.get("$baseUrl/v1/sessions/$sessionId/messages") {
            header("Authorization", authHeader())
            parameter("limit", limit)
            parameter("offset", offset)
        }
    }

    // Credential endpoints
    suspend fun listCredentials(): NetworkResult<ListCredentialsResponse> = safeCall {
        client.get("$baseUrl/v1/credentials") {
            header("Authorization", authHeader())
        }
    }

    suspend fun createCredential(request: CreateCredentialRequest): NetworkResult<Credential> = safeCall {
        client.post("$baseUrl/v1/credentials") {
            header("Authorization", authHeader())
            setBody(request)
        }
    }

    suspend fun deleteCredential(id: String): NetworkResult<Unit> = safeCall {
        client.delete("$baseUrl/v1/credentials/$id") {
            header("Authorization", authHeader())
            headers.remove(io.ktor.http.HttpHeaders.ContentType)
        }
    }

    // Workspace endpoints
    suspend fun listWorkspaces(): NetworkResult<ListWorkspacesResponse> = safeCall {
        client.get("$baseUrl/v1/workspaces") {
            header("Authorization", authHeader())
        }
    }

    suspend fun createWorkspace(request: CreateWorkspaceRequest): NetworkResult<WorkspaceRecord> = safeCall {
        client.post("$baseUrl/v1/workspaces") {
            header("Authorization", authHeader())
            setBody(request)
        }
    }

    suspend fun getWorkspace(id: String): NetworkResult<WorkspaceRecord> = safeCall {
        client.get("$baseUrl/v1/workspaces/$id") {
            header("Authorization", authHeader())
        }
    }

    suspend fun deleteWorkspace(id: String): NetworkResult<Unit> = safeCall {
        client.delete("$baseUrl/v1/workspaces/$id") {
            header("Authorization", authHeader())
            headers.remove(io.ktor.http.HttpHeaders.ContentType)
        }
    }

    suspend fun getWorkspaceCheckouts(workspaceId: String): NetworkResult<ListWorkspaceCheckoutsResponse> = safeCall {
        client.get("$baseUrl/v1/workspaces/$workspaceId/checkouts") {
            header("Authorization", authHeader())
        }
    }

    suspend fun deleteWorkspaceCheckout(workspaceId: String, repoId: String): NetworkResult<Unit> = safeCall {
        client.delete("$baseUrl/v1/workspaces/$workspaceId/checkouts/$repoId") {
            header("Authorization", authHeader())
            headers.remove(io.ktor.http.HttpHeaders.ContentType)
        }
    }

    // Discovery endpoints
    suspend fun scanForRepos(
        startPath: String,
        maxDepth: Int = 3
    ): NetworkResult<DiscoveryResult> = safeCall {
        client.get("$baseUrl/v1/discovery/scan") {
            header("Authorization", authHeader())
            parameter("path", startPath)
            parameter("maxDepth", maxDepth)
        }
    }

    suspend fun cloneRepo(request: CloneWorkspaceRequest): NetworkResult<CloneWorkspaceResponse> = safeCall {
        client.post("$baseUrl/v1/discovery/clone") {
            header("Authorization", authHeader())
            setBody(request)
        }
    }

    // Managed repos endpoints
    suspend fun listManagedRepos(
        workspaceId: String = "default"
    ): NetworkResult<ListManagedReposResponse> = safeCall {
        client.get("$baseUrl/v1/repos") {
            header("Authorization", authHeader())
            parameter("workspaceId", workspaceId)
        }
    }

    suspend fun getManagedRepo(id: String): NetworkResult<ManagedRepo> = safeCall {
        client.get("$baseUrl/v1/repos/$id") {
            header("Authorization", authHeader())
        }
    }

    suspend fun deleteManagedRepo(id: String): NetworkResult<Unit> = safeCall {
        client.delete("$baseUrl/v1/repos/$id") {
            header("Authorization", authHeader())
            headers.remove(io.ktor.http.HttpHeaders.ContentType)
        }
    }

    // Test connection (lightweight check)
    suspend fun testConnection(): NetworkResult<Boolean> {
        return when (val result = ready()) {
            is Result.Success -> Result.Success(result.value.status == "ready")
            is Result.Failure -> Result.Failure(result.error)
        }
    }
}
