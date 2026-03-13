package uk.adedamola.aperture.presentation.screen.sessions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.adedamola.aperture.core.util.DateTimeFormatter
import uk.adedamola.aperture.core.util.toSessionIdShort
import uk.adedamola.aperture.domain.model.AgentType
import uk.adedamola.aperture.domain.model.AuthMode
import uk.adedamola.aperture.domain.model.ManagedRepo
import uk.adedamola.aperture.domain.model.RepoMode
import uk.adedamola.aperture.domain.model.SessionStatus
import uk.adedamola.aperture.ui.components.HudBadge
import uk.adedamola.aperture.ui.components.HudBadgeVariant
import uk.adedamola.aperture.ui.components.HudButtonVariant
import uk.adedamola.aperture.ui.components.HudTextButton
import uk.adedamola.aperture.ui.components.HudCard
import uk.adedamola.aperture.ui.components.HudDialog
import uk.adedamola.aperture.ui.components.HudInput
import uk.adedamola.aperture.ui.components.HudSelect
import uk.adedamola.aperture.ui.components.HudSkeletonList
import uk.adedamola.aperture.ui.components.HudSpinner
import uk.adedamola.aperture.ui.components.HudStatusDot
import uk.adedamola.aperture.ui.components.SelectOption
import uk.adedamola.aperture.ui.components.ToastData
import uk.adedamola.aperture.ui.components.ToastType
import uk.adedamola.aperture.ui.components.rememberToastHostState
import uk.adedamola.aperture.ui.components.layout.HudShell
import uk.adedamola.aperture.ui.components.layout.HudTopbarAction
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudSuccess
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun SessionsScreen(
    onSessionClick: (String) -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: SessionsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val createState by viewModel.createSessionState.collectAsStateWithLifecycle()
    val toastHostState = rememberToastHostState()

    // Show toast when session needs local deletion confirmation
    LaunchedEffect(uiState.pendingLocalDelete) {
        uiState.pendingLocalDelete?.let {
            toastHostState.showToast(
                ToastData(
                    message = "This session no longer exists on the server",
                    type = ToastType.WARNING,
                    durationMs = 8000,
                    action = "Remove from device",
                    onAction = { viewModel.confirmLocalDelete() }
                )
            )
        }
    }

    HudShell(
        title = "Sessions",
        currentRoute = "sessions",
        onNavigate = onNavigate,
        isConnected = uiState.isConnected,
        toastHostState = toastHostState,
        topBarActions = {
            HudTopbarAction(
                icon = Icons.Default.Refresh,
                onClick = { viewModel.refreshSessions() },
                contentDescription = "Refresh"
            )
            HudTopbarAction(
                icon = Icons.Default.Add,
                onClick = { viewModel.showCreateDialog() },
                contentDescription = "New Session"
            )
        }
    ) {
        when {
            uiState.isLoading -> {
                HudSkeletonList(itemCount = 3)
            }
            uiState.sessions.isEmpty() -> {
                EmptySessionsState(
                    onCreateClick = { viewModel.showCreateDialog() }
                )
            }
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 300.dp),
                    contentPadding = PaddingValues(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(
                        items = uiState.sessions,
                        key = { it.id }
                    ) { session ->
                        SessionCard(
                            session = session,
                            onClick = { onSessionClick(session.id) },
                            onDelete = { viewModel.deleteSession(session.id) }
                        )
                    }
                }
            }
        }

        // Create session dialog
        if (uiState.showCreateDialog) {
            CreateSessionDialog(
                createState = createState,
                isCreating = uiState.isCreating,
                onDismiss = { viewModel.hideCreateDialog() },
                onAgentTypeChange = viewModel::updateAgentType,
                onAuthModeChange = viewModel::updateAuthMode,
                onRepoModeChange = viewModel::updateRepoMode,
                onRepoUrlChange = viewModel::updateRepoUrl,
                onExistingRepoChange = viewModel::updateExistingRepoId,
                onCreate = { viewModel.createSession(onSessionClick) }
            )
        }
    }
}

@Composable
private fun SessionCard(
    session: SessionStatus,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    HudCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            // Header row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Agent icon
                Icon(
                    imageVector = when (session.agent) {
                        AgentType.CLAUDE_SDK -> Icons.Default.SmartToy
                        AgentType.PI_SDK -> Icons.Default.Memory
                    },
                    contentDescription = null,
                    tint = HudAccent,
                    modifier = Modifier.size(24.dp)
                )

                Spacer(modifier = Modifier.width(8.dp))

                // Session ID and type
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = session.id.toSessionIdShort(),
                        color = HudWhite,
                        fontSize = 14.sp
                    )
                    Text(
                        text = when (session.agent) {
                            AgentType.CLAUDE_SDK -> "Claude SDK"
                            AgentType.PI_SDK -> "Pi SDK"
                        },
                        color = HudText,
                        fontSize = 11.sp
                    )
                }

                // Status dot
                HudStatusDot(
                    color = if (session.running) HudSuccess else HudGray,
                    size = 8.dp,
                    animated = session.running
                )

                Spacer(modifier = Modifier.width(8.dp))

                // Delete button
                IconButton(
                    onClick = onDelete,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Delete",
                        tint = HudText,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Working directory
            if (session.workingDirectory != null) {
                Text(
                    text = session.workingDirectory,
                    color = HudText,
                    fontSize = 11.sp,
                    maxLines = 1
                )
                Spacer(modifier = Modifier.height(4.dp))
            }

            // Status badges
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                HudBadge(
                    text = if (session.running) "ACTIVE" else "IDLE",
                    variant = if (session.running) HudBadgeVariant.SUCCESS else HudBadgeVariant.DEFAULT
                )

                if (session.isResumable == true) {
                    HudBadge(
                        text = "RESUMABLE",
                        variant = HudBadgeVariant.INFO
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Last activity
            Text(
                text = "Last active: ${DateTimeFormatter.formatRelative(session.lastActivityTime)}",
                color = HudGray,
                fontSize = 10.sp
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Open button
            HudTextButton(
                onClick = onClick,
                text = "OPEN",
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun EmptySessionsState(
    onCreateClick: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.SmartToy,
                contentDescription = null,
                tint = HudGray,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "NO ACTIVE SESSIONS",
                color = HudText,
                fontSize = 14.sp,
                letterSpacing = 2.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Create a new session to get started",
                color = HudGray,
                fontSize = 12.sp
            )

            Spacer(modifier = Modifier.height(24.dp))

            HudTextButton(
                onClick = onCreateClick,
                text = "NEW SESSION",
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                }
            )
        }
    }
}

@Composable
private fun CreateSessionDialog(
    createState: CreateSessionState,
    isCreating: Boolean,
    onDismiss: () -> Unit,
    onAgentTypeChange: (AgentType) -> Unit,
    onAuthModeChange: (AuthMode) -> Unit,
    onRepoModeChange: (RepoMode) -> Unit,
    onRepoUrlChange: (String) -> Unit,
    onExistingRepoChange: (String?) -> Unit,
    onCreate: () -> Unit
) {
    val agentOptions = listOf(
        SelectOption(AgentType.CLAUDE_SDK, "Claude SDK", "Full Claude Code SDK"),
        SelectOption(AgentType.PI_SDK, "Pi SDK", "Pi Agent SDK")
    )

    val authOptions = listOf(
        SelectOption(AuthMode.OAUTH, "OAuth", "Use OAuth authentication"),
        SelectOption(AuthMode.API_KEY, "API Key", "Use stored credential")
    )

    val repoModeOptions = listOf(
        SelectOption(RepoMode.NONE, "No Repo", "Start without a working directory"),
        SelectOption(RepoMode.INIT, "Init Empty", "Create a new empty git repository"),
        SelectOption(RepoMode.CLONE, "Clone", "Clone from a GitHub URL"),
        SelectOption(RepoMode.EXISTING, "Existing", "Use a previously created repo")
    )

    HudDialog(
        onDismiss = onDismiss,
        title = "New Session",
        icon = Icons.Default.Add,
        actions = {
            HudTextButton(
                onClick = onDismiss,
                text = "Cancel",
                variant = HudButtonVariant.GHOST,
                enabled = !isCreating
            )
            Spacer(modifier = Modifier.width(8.dp))
            HudTextButton(
                onClick = onCreate,
                text = if (isCreating) "Creating..." else "Create",
                enabled = !isCreating && isCreateButtonEnabled(createState),
                trailingIcon = if (isCreating) {
                    { HudSpinner(size = 16.dp) }
                } else null
            )
        }
    ) {
        Column {
            // Repo Mode Selector
            HudSelect(
                options = repoModeOptions,
                selectedValue = createState.repoMode,
                onValueChange = onRepoModeChange,
                label = "Repository"
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Repo mode-specific content
            RepoModeContent(
                repoMode = createState.repoMode,
                repoUrl = createState.repoUrl,
                onRepoUrlChange = onRepoUrlChange,
                managedRepos = createState.managedRepos,
                selectedRepoId = createState.existingRepoId,
                onExistingRepoChange = onExistingRepoChange,
                isLoadingRepos = createState.isLoadingRepos
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Divider with label
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(1.dp)
                        .padding(end = 8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(vertical = 0.dp)
                    ) {
                        // Simple divider line
                    }
                }
                Text(
                    text = "AGENT SETTINGS",
                    color = HudGray,
                    fontSize = 10.sp,
                    letterSpacing = 1.sp
                )
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(1.dp)
                        .padding(start = 8.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            HudSelect(
                options = agentOptions,
                selectedValue = createState.agentType,
                onValueChange = onAgentTypeChange,
                label = "Agent Type"
            )

            Spacer(modifier = Modifier.height(16.dp))

            HudSelect(
                options = authOptions,
                selectedValue = createState.authMode,
                onValueChange = onAuthModeChange,
                label = "Authentication"
            )
        }
    }
}

@Composable
private fun RepoModeContent(
    repoMode: RepoMode,
    repoUrl: String,
    onRepoUrlChange: (String) -> Unit,
    managedRepos: List<ManagedRepo>,
    selectedRepoId: String?,
    onExistingRepoChange: (String?) -> Unit,
    isLoadingRepos: Boolean
) {
    when (repoMode) {
        RepoMode.NONE -> {
            // Info box for no repo mode
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
            ) {
                Text(
                    text = "Session will start without a working directory",
                    color = HudText,
                    fontSize = 12.sp
                )
            }
        }
        RepoMode.INIT -> {
            // Info box for init mode
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
            ) {
                Column {
                    Text(
                        text = "A new git repository will be created",
                        color = HudText,
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Path: ~/.aperture/workspaces/default/session-<id>/",
                        color = HudGray,
                        fontSize = 10.sp
                    )
                }
            }
        }
        RepoMode.CLONE -> {
            // GitHub URL input
            HudInput(
                value = repoUrl,
                onValueChange = onRepoUrlChange,
                label = "GitHub URL",
                placeholder = "https://github.com/user/repo.git"
            )
            if (repoUrl.isNotBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Will clone to: ~/.aperture/workspaces/default/${extractRepoName(repoUrl)}-<id>/",
                    color = HudGray,
                    fontSize = 10.sp
                )
            }
        }
        RepoMode.EXISTING -> {
            // Existing repo picker
            if (isLoadingRepos) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    HudSpinner(size = 24.dp)
                }
            } else if (managedRepos.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp)
                ) {
                    Text(
                        text = "No existing repos. Use Init or Clone to create one first.",
                        color = HudText,
                        fontSize = 12.sp
                    )
                }
            } else {
                val repoOptions = managedRepos.map { repo ->
                    SelectOption(repo.id, repo.name, repo.originUrl ?: repo.path)
                }
                HudSelect(
                    options = repoOptions,
                    selectedValue = selectedRepoId ?: "",
                    onValueChange = { id -> onExistingRepoChange(id.takeIf { it.isNotEmpty() }) },
                    label = "Select Repository"
                )
                // Show selected repo path
                selectedRepoId?.let { id ->
                    managedRepos.find { it.id == id }?.let { repo ->
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Path: ${repo.path}",
                            color = HudGray,
                            fontSize = 10.sp
                        )
                    }
                }
            }
        }
    }
}

/**
 * Check if the create button should be enabled based on current state
 */
private fun isCreateButtonEnabled(createState: CreateSessionState): Boolean {
    return when (createState.repoMode) {
        RepoMode.NONE -> true
        RepoMode.INIT -> true
        RepoMode.CLONE -> createState.repoUrl.isNotBlank()
        RepoMode.EXISTING -> createState.existingRepoId != null
    }
}

/**
 * Extract repo name from URL for display
 */
private fun extractRepoName(url: String): String {
    if (url.isBlank()) return "<repo-name>"
    val match = Regex("/([^/]+?)(\\.git)?$").find(url)
        ?: Regex(":([^/]+?)(\\.git)?$").find(url)
    return match?.groupValues?.get(1) ?: "repo"
}
