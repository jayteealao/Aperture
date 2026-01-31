package uk.adedamola.aperture.core.datastore

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "aperture_prefs")

@Singleton
class AppPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val dataStore = context.dataStore

    companion object {
        private val GATEWAY_URL = stringPreferencesKey("gateway_url")
        private val API_TOKEN = stringPreferencesKey("api_token")
        private val IS_CONNECTED = booleanPreferencesKey("is_connected")
        private val ACTIVE_SESSION_ID = stringPreferencesKey("active_session_id")
        private val SIDEBAR_OPEN = booleanPreferencesKey("sidebar_open")
        private val SDK_PANEL_OPEN = booleanPreferencesKey("sdk_panel_open")
        private val THEME_MODE = stringPreferencesKey("theme_mode")
        private val SCANLINES_ENABLED = booleanPreferencesKey("scanlines_enabled")
        private val GRID_OVERLAY_ENABLED = booleanPreferencesKey("grid_overlay_enabled")
    }

    // Gateway URL
    val gatewayUrl: Flow<String?> = dataStore.data.map { it[GATEWAY_URL] }

    suspend fun setGatewayUrl(url: String) {
        dataStore.edit { it[GATEWAY_URL] = url }
    }

    // API Token (consider using EncryptedSharedPreferences for sensitive data)
    val apiToken: Flow<String?> = dataStore.data.map { it[API_TOKEN] }

    suspend fun setApiToken(token: String) {
        dataStore.edit { it[API_TOKEN] = token }
    }

    suspend fun clearApiToken() {
        dataStore.edit { it.remove(API_TOKEN) }
    }

    // Connection status
    val isConnected: Flow<Boolean> = dataStore.data.map { it[IS_CONNECTED] ?: false }

    suspend fun setConnected(connected: Boolean) {
        dataStore.edit { it[IS_CONNECTED] = connected }
    }

    // Active session
    val activeSessionId: Flow<String?> = dataStore.data.map { it[ACTIVE_SESSION_ID] }

    suspend fun setActiveSessionId(sessionId: String?) {
        dataStore.edit {
            if (sessionId != null) {
                it[ACTIVE_SESSION_ID] = sessionId
            } else {
                it.remove(ACTIVE_SESSION_ID)
            }
        }
    }

    // Sidebar state
    val sidebarOpen: Flow<Boolean> = dataStore.data.map { it[SIDEBAR_OPEN] ?: true }

    suspend fun setSidebarOpen(open: Boolean) {
        dataStore.edit { it[SIDEBAR_OPEN] = open }
    }

    // SDK panel state
    val sdkPanelOpen: Flow<Boolean> = dataStore.data.map { it[SDK_PANEL_OPEN] ?: true }

    suspend fun setSdkPanelOpen(open: Boolean) {
        dataStore.edit { it[SDK_PANEL_OPEN] = open }
    }

    // Theme mode
    val themeMode: Flow<String> = dataStore.data.map { it[THEME_MODE] ?: "dark" }

    suspend fun setThemeMode(mode: String) {
        dataStore.edit { it[THEME_MODE] = mode }
    }

    // Visual effects
    val scanlinesEnabled: Flow<Boolean> = dataStore.data.map { it[SCANLINES_ENABLED] ?: false }

    suspend fun setScanlinesEnabled(enabled: Boolean) {
        dataStore.edit { it[SCANLINES_ENABLED] = enabled }
    }

    val gridOverlayEnabled: Flow<Boolean> = dataStore.data.map { it[GRID_OVERLAY_ENABLED] ?: true }

    suspend fun setGridOverlayEnabled(enabled: Boolean) {
        dataStore.edit { it[GRID_OVERLAY_ENABLED] = enabled }
    }

    // Clear all data
    suspend fun clearAll() {
        dataStore.edit { it.clear() }
    }

    // Get all preferences as a snapshot
    data class PreferencesSnapshot(
        val gatewayUrl: String?,
        val apiToken: String?,
        val isConnected: Boolean,
        val activeSessionId: String?,
        val sidebarOpen: Boolean,
        val sdkPanelOpen: Boolean,
        val themeMode: String,
        val scanlinesEnabled: Boolean,
        val gridOverlayEnabled: Boolean
    )

    val allPreferences: Flow<PreferencesSnapshot> = dataStore.data.map { prefs ->
        PreferencesSnapshot(
            gatewayUrl = prefs[GATEWAY_URL],
            apiToken = prefs[API_TOKEN],
            isConnected = prefs[IS_CONNECTED] ?: false,
            activeSessionId = prefs[ACTIVE_SESSION_ID],
            sidebarOpen = prefs[SIDEBAR_OPEN] ?: true,
            sdkPanelOpen = prefs[SDK_PANEL_OPEN] ?: true,
            themeMode = prefs[THEME_MODE] ?: "dark",
            scanlinesEnabled = prefs[SCANLINES_ENABLED] ?: false,
            gridOverlayEnabled = prefs[GRID_OVERLAY_ENABLED] ?: true
        )
    }
}
