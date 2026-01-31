package uk.adedamola.aperture.data.repository

import kotlinx.coroutines.flow.Flow
import uk.adedamola.aperture.core.datastore.AppPreferences
import uk.adedamola.aperture.core.util.NetworkResult
import uk.adedamola.aperture.core.util.Result
import uk.adedamola.aperture.data.remote.api.ApertureApi
import uk.adedamola.aperture.data.remote.api.WebSocketManager
import uk.adedamola.aperture.domain.repository.SettingsRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SettingsRepositoryImpl @Inject constructor(
    private val preferences: AppPreferences,
    private val api: ApertureApi,
    private val webSocketManager: WebSocketManager
) : SettingsRepository {

    override val gatewayUrl: Flow<String?> = preferences.gatewayUrl
    override val apiToken: Flow<String?> = preferences.apiToken
    override val isConnected: Flow<Boolean> = preferences.isConnected

    override suspend fun setGatewayUrl(url: String) {
        preferences.setGatewayUrl(url)
        api.configure(url, "")
        webSocketManager.configure(url, "")
    }

    override suspend fun setApiToken(token: String) {
        preferences.setApiToken(token)
    }

    override suspend fun setConnected(connected: Boolean) {
        preferences.setConnected(connected)
    }

    override suspend fun clearAll() {
        preferences.clearAll()
        webSocketManager.disconnectAll()
    }

    override suspend fun testConnection(url: String, token: String): NetworkResult<Boolean> {
        // Temporarily configure API with provided credentials
        api.configure(url, token)
        webSocketManager.configure(url, token)

        return when (val result = api.testConnection()) {
            is Result.Success -> {
                if (result.value) {
                    // Connection successful, persist settings
                    preferences.setGatewayUrl(url)
                    preferences.setApiToken(token)
                    preferences.setConnected(true)
                }
                Result.Success(result.value)
            }
            is Result.Failure -> {
                preferences.setConnected(false)
                result
            }
        }
    }
}
