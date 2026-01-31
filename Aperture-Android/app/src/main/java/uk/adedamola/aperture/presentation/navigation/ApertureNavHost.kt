package uk.adedamola.aperture.presentation.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import uk.adedamola.aperture.presentation.screen.credentials.CredentialsScreen
import uk.adedamola.aperture.presentation.screen.help.HelpScreen
import uk.adedamola.aperture.presentation.screen.onboarding.OnboardingScreen
import uk.adedamola.aperture.presentation.screen.sessions.SessionsScreen
import uk.adedamola.aperture.presentation.screen.settings.SettingsScreen
import uk.adedamola.aperture.presentation.screen.workspace.WorkspaceScreen
import uk.adedamola.aperture.presentation.screen.workspaces.WorkspacesScreen

/**
 * Main navigation host for the Aperture app.
 * Uses type-safe navigation with serializable route classes.
 */
@Composable
fun ApertureNavHost(
    modifier: Modifier = Modifier,
    startDestination: Any = OnboardingKey
) {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        // Onboarding
        composable<OnboardingKey> {
            OnboardingScreen(
                onConnected = {
                    navController.navigate(SessionsKey) {
                        popUpTo(OnboardingKey) { inclusive = true }
                    }
                }
            )
        }

        // Sessions list
        composable<SessionsKey> {
            SessionsScreen(
                onSessionClick = { sessionId ->
                    navController.navigate(WorkspaceKey(sessionId))
                },
                onNavigate = { route ->
                    when (route) {
                        "workspaces" -> navController.navigate(WorkspacesKey)
                        "credentials" -> navController.navigate(CredentialsKey)
                        "settings" -> navController.navigate(SettingsKey)
                        "help" -> navController.navigate(HelpKey)
                    }
                }
            )
        }

        // Workspace (session detail)
        composable<WorkspaceKey> { backStackEntry ->
            val route: WorkspaceKey = backStackEntry.toRoute()
            WorkspaceScreen(
                sessionId = route.sessionId,
                onBack = { navController.popBackStack() },
                onNavigate = { navRoute ->
                    when (navRoute) {
                        "workspaces" -> navController.navigate(WorkspacesKey)
                        "credentials" -> navController.navigate(CredentialsKey)
                        "settings" -> navController.navigate(SettingsKey)
                        "help" -> navController.navigate(HelpKey)
                        "sessions" -> navController.navigate(SessionsKey) {
                            popUpTo(SessionsKey) { inclusive = true }
                        }
                    }
                }
            )
        }

        // Workspaces list
        composable<WorkspacesKey> {
            WorkspacesScreen(
                onBack = { navController.popBackStack() },
                onNavigate = { route ->
                    when (route) {
                        "sessions" -> navController.navigate(SessionsKey) {
                            popUpTo(SessionsKey) { inclusive = true }
                        }
                        "credentials" -> navController.navigate(CredentialsKey)
                        "settings" -> navController.navigate(SettingsKey)
                        "help" -> navController.navigate(HelpKey)
                    }
                }
            )
        }

        // Credentials
        composable<CredentialsKey> {
            CredentialsScreen(
                onBack = { navController.popBackStack() },
                onNavigate = { route ->
                    when (route) {
                        "sessions" -> navController.navigate(SessionsKey) {
                            popUpTo(SessionsKey) { inclusive = true }
                        }
                        "workspaces" -> navController.navigate(WorkspacesKey)
                        "settings" -> navController.navigate(SettingsKey)
                        "help" -> navController.navigate(HelpKey)
                    }
                }
            )
        }

        // Settings
        composable<SettingsKey> {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onDisconnect = {
                    navController.navigate(OnboardingKey) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onNavigate = { route ->
                    when (route) {
                        "sessions" -> navController.navigate(SessionsKey) {
                            popUpTo(SessionsKey) { inclusive = true }
                        }
                        "workspaces" -> navController.navigate(WorkspacesKey)
                        "credentials" -> navController.navigate(CredentialsKey)
                        "help" -> navController.navigate(HelpKey)
                    }
                }
            )
        }

        // Help
        composable<HelpKey> {
            HelpScreen(
                onBack = { navController.popBackStack() },
                onNavigate = { route ->
                    when (route) {
                        "sessions" -> navController.navigate(SessionsKey) {
                            popUpTo(SessionsKey) { inclusive = true }
                        }
                        "workspaces" -> navController.navigate(WorkspacesKey)
                        "credentials" -> navController.navigate(CredentialsKey)
                        "settings" -> navController.navigate(SettingsKey)
                    }
                }
            )
        }
    }
}
