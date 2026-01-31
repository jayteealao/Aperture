package uk.adedamola.aperture.presentation.screen.workspaces

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
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.adedamola.aperture.core.util.DateTimeFormatter
import uk.adedamola.aperture.domain.model.WorkspaceRecord
import uk.adedamola.aperture.ui.components.HudAccordion
import uk.adedamola.aperture.ui.components.HudBadge
import uk.adedamola.aperture.ui.components.HudBadgeVariant
import uk.adedamola.aperture.ui.components.HudButtonVariant
import uk.adedamola.aperture.ui.components.HudTextButton
import uk.adedamola.aperture.ui.components.HudCard
import uk.adedamola.aperture.ui.components.HudConfirmDialog
import uk.adedamola.aperture.ui.components.HudDialog
import uk.adedamola.aperture.ui.components.HudInput
import uk.adedamola.aperture.ui.components.HudSkeletonList
import uk.adedamola.aperture.ui.components.HudSpinner
import uk.adedamola.aperture.ui.components.layout.HudShell
import uk.adedamola.aperture.ui.components.layout.HudTopbarAction
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun WorkspacesScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: WorkspacesViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showCreateDialog by remember { mutableStateOf(false) }
    var workspaceToDelete by remember { mutableStateOf<WorkspaceRecord?>(null) }

    HudShell(
        title = "Workspaces",
        currentRoute = "workspaces",
        onNavigate = onNavigate,
        onBackClick = onBack,
        isConnected = uiState.isConnected,
        topBarActions = {
            HudTopbarAction(
                icon = Icons.Default.Refresh,
                onClick = { viewModel.refreshWorkspaces() },
                contentDescription = "Refresh"
            )
            HudTopbarAction(
                icon = Icons.Default.Add,
                onClick = { showCreateDialog = true },
                contentDescription = "New Workspace"
            )
        }
    ) {
        when {
            uiState.isLoading -> {
                HudSkeletonList(itemCount = 3)
            }
            uiState.workspaces.isEmpty() -> {
                EmptyWorkspacesState(
                    onCreateClick = { showCreateDialog = true }
                )
            }
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 320.dp),
                    contentPadding = PaddingValues(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(
                        items = uiState.workspaces,
                        key = { it.id }
                    ) { workspace ->
                        WorkspaceCard(
                            workspace = workspace,
                            onDelete = { workspaceToDelete = workspace }
                        )
                    }
                }
            }
        }

        // Create dialog
        if (showCreateDialog) {
            CreateWorkspaceDialog(
                onDismiss = { showCreateDialog = false },
                onCreate = { name, repoRoot, description ->
                    viewModel.createWorkspace(name, repoRoot, description)
                    showCreateDialog = false
                },
                isCreating = uiState.isCreating
            )
        }

        // Delete confirmation
        workspaceToDelete?.let { workspace ->
            HudConfirmDialog(
                onDismiss = { workspaceToDelete = null },
                onConfirm = {
                    viewModel.deleteWorkspace(workspace.id)
                    workspaceToDelete = null
                },
                title = "Delete Workspace",
                message = "Are you sure you want to delete '${workspace.name}'? This action cannot be undone.",
                confirmText = "Delete",
                isDangerous = true
            )
        }
    }
}

@Composable
private fun WorkspaceCard(
    workspace: WorkspaceRecord,
    onDelete: () -> Unit
) {
    HudCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Folder,
                    contentDescription = null,
                    tint = HudAccent,
                    modifier = Modifier.size(24.dp)
                )

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = workspace.name,
                        color = HudWhite,
                        fontSize = 14.sp
                    )
                    Text(
                        text = workspace.repoRoot,
                        color = HudText,
                        fontSize = 11.sp,
                        maxLines = 1
                    )
                }

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

            // Description
            if (workspace.description != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = workspace.description,
                    color = HudText,
                    fontSize = 12.sp,
                    maxLines = 2
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Created date
            Text(
                text = "Created: ${workspace.createdAt}",
                color = HudGray,
                fontSize = 10.sp
            )
        }
    }
}

@Composable
private fun EmptyWorkspacesState(
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
                imageVector = Icons.Default.Folder,
                contentDescription = null,
                tint = HudGray,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "NO WORKSPACES",
                color = HudText,
                fontSize = 14.sp,
                letterSpacing = 2.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Create a workspace to organize your projects",
                color = HudGray,
                fontSize = 12.sp
            )

            Spacer(modifier = Modifier.height(24.dp))

            HudTextButton(
                onClick = onCreateClick,
                text = "NEW WORKSPACE",
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
private fun CreateWorkspaceDialog(
    onDismiss: () -> Unit,
    onCreate: (name: String, repoRoot: String, description: String?) -> Unit,
    isCreating: Boolean
) {
    var name by remember { mutableStateOf("") }
    var repoRoot by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }

    HudDialog(
        onDismiss = onDismiss,
        title = "New Workspace",
        icon = Icons.Default.Folder,
        actions = {
            HudTextButton(
                onClick = onDismiss,
                text = "Cancel",
                variant = HudButtonVariant.GHOST,
                enabled = !isCreating
            )
            Spacer(modifier = Modifier.width(8.dp))
            HudTextButton(
                onClick = {
                    onCreate(
                        name,
                        repoRoot,
                        description.takeIf { it.isNotBlank() }
                    )
                },
                text = if (isCreating) "Creating..." else "Create",
                enabled = !isCreating && name.isNotBlank() && repoRoot.isNotBlank(),
                trailingIcon = if (isCreating) {
                    { HudSpinner(size = 16.dp) }
                } else null
            )
        }
    ) {
        Column {
            HudInput(
                value = name,
                onValueChange = { name = it },
                label = "Name",
                placeholder = "My Workspace"
            )

            Spacer(modifier = Modifier.height(16.dp))

            HudInput(
                value = repoRoot,
                onValueChange = { repoRoot = it },
                label = "Repository Path",
                placeholder = "/path/to/repo"
            )

            Spacer(modifier = Modifier.height(16.dp))

            HudInput(
                value = description,
                onValueChange = { description = it },
                label = "Description (Optional)",
                placeholder = "Brief description"
            )
        }
    }
}
