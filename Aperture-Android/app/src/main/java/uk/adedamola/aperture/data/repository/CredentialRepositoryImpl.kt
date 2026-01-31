package uk.adedamola.aperture.data.repository

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import uk.adedamola.aperture.core.util.NetworkResult
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.data.remote.api.ApertureApi
import uk.adedamola.aperture.domain.model.CreateCredentialRequest
import uk.adedamola.aperture.domain.model.Credential
import uk.adedamola.aperture.domain.repository.CredentialRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CredentialRepositoryImpl @Inject constructor(
    private val api: ApertureApi
) : CredentialRepository {

    private val _credentials = MutableStateFlow<List<Credential>>(emptyList())
    override val credentials: Flow<List<Credential>> = _credentials.asStateFlow()

    override suspend fun refreshCredentials(): NetworkResult<List<Credential>> {
        return when (val result = api.listCredentials()) {
            is Result.Success -> {
                val credentials = result.value.credentials
                _credentials.value = credentials
                Result.Success(credentials)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun createCredential(request: CreateCredentialRequest): NetworkResult<Credential> {
        return when (val result = api.createCredential(request)) {
            is Result.Success -> {
                refreshCredentials()
                Result.Success(result.value)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun deleteCredential(id: String): NetworkResult<Unit> {
        return when (val result = api.deleteCredential(id)) {
            is Result.Success -> {
                refreshCredentials()
                Result.Success(Unit)
            }
            is Result.Failure -> result
        }
    }

    override suspend fun getCredential(id: String): NetworkResult<Credential?> {
        return Result.Success(_credentials.value.find { it.id == id })
    }
}
