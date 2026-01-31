package uk.adedamola.aperture.presentation.navigation

import kotlinx.serialization.Serializable

/**
 * Navigation keys for Navigation 3.
 * All destinations are @Serializable data classes/objects.
 */

@Serializable
data object OnboardingKey

@Serializable
data object SessionsKey

@Serializable
data class WorkspaceKey(val sessionId: String)

@Serializable
data object WorkspacesKey

@Serializable
data object CredentialsKey

@Serializable
data object SettingsKey

@Serializable
data object HelpKey
