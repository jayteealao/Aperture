package uk.adedamola.aperture.presentation.screen.credentials

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
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
import uk.adedamola.aperture.domain.model.Credential
import uk.adedamola.aperture.domain.model.ProviderKey
import uk.adedamola.aperture.ui.components.HudBadge
import uk.adedamola.aperture.ui.components.HudBadgeVariant
import uk.adedamola.aperture.ui.components.HudButtonVariant
import uk.adedamola.aperture.ui.components.HudTextButton
import uk.adedamola.aperture.ui.components.HudCard
import uk.adedamola.aperture.ui.components.HudConfirmDialog
import uk.adedamola.aperture.ui.components.HudDialog
import uk.adedamola.aperture.ui.components.HudInput
import uk.adedamola.aperture.ui.components.HudSelect
import uk.adedamola.aperture.ui.components.HudSkeletonList
import uk.adedamola.aperture.ui.components.HudSpinner
import uk.adedamola.aperture.ui.components.SelectOption
import uk.adedamola.aperture.ui.components.layout.HudShell
import uk.adedamola.aperture.ui.components.layout.HudTopbarAction
import uk.adedamola.aperture.ui.theme.HudAccent
import uk.adedamola.aperture.ui.theme.HudGray
import uk.adedamola.aperture.ui.theme.HudText
import uk.adedamola.aperture.ui.theme.HudWhite

@Composable
fun CredentialsScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: CredentialsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var showCreateDialog by remember { mutableStateOf(false) }
    var credentialToDelete by remember { mutableStateOf<Credential?>(null) }

    HudShell(
        title = "Credentials",
        currentRoute = "credentials",
        onNavigate = onNavigate,
        onBackClick = onBack,
        isConnected = uiState.isConnected,
        topBarActions = {
            HudTopbarAction(
                icon = Icons.Default.Refresh,
                onClick = { viewModel.refreshCredentials() },
                contentDescription = "Refresh"
            )
            HudTopbarAction(
                icon = Icons.Default.Add,
                onClick = { showCreateDialog = true },
                contentDescription = "New Credential"
            )
        }
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Security notice
            HudCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Key,
                        contentDescription = null,
                        tint = HudAccent,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "Credentials are AES-256 encrypted and decrypted only when needed.",
                        color = HudText,
                        fontSize = 12.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            when {
                uiState.isLoading -> {
                    HudSkeletonList(itemCount = 3)
                }
                uiState.credentials.isEmpty() -> {
                    EmptyCredentialsState(
                        onCreateClick = { showCreateDialog = true }
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
                            items = uiState.credentials,
                            key = { it.id }
                        ) { credential ->
                            CredentialCard(
                                credential = credential,
                                onDelete = { credentialToDelete = credential }
                            )
                        }
                    }
                }
            }
        }

        // Create dialog
        if (showCreateDialog) {
            CreateCredentialDialog(
                onDismiss = { showCreateDialog = false },
                onCreate = { provider, label, apiKey ->
                    viewModel.createCredential(provider, label, apiKey)
                    showCreateDialog = false
                },
                isCreating = uiState.isCreating
            )
        }

        // Delete confirmation
        credentialToDelete?.let { credential ->
            HudConfirmDialog(
                onDismiss = { credentialToDelete = null },
                onConfirm = {
                    viewModel.deleteCredential(credential.id)
                    credentialToDelete = null
                },
                title = "Delete Credential",
                message = "Are you sure you want to delete '${credential.label}'? This action cannot be undone.",
                confirmText = "Delete",
                isDangerous = true
            )
        }
    }
}

@Composable
private fun CredentialCard(
    credential: Credential,
    onDelete: () -> Unit
) {
    var showApiKey by remember { mutableStateOf(false) }

    HudCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                HudBadge(
                    text = credential.provider.name,
                    variant = when (credential.provider) {
                        ProviderKey.ANTHROPIC -> HudBadgeVariant.SUCCESS
                        ProviderKey.OPENAI -> HudBadgeVariant.INFO
                        ProviderKey.GOOGLE -> HudBadgeVariant.WARNING
                        else -> HudBadgeVariant.DEFAULT
                    }
                )

                Spacer(modifier = Modifier.weight(1f))

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

            // Label
            Text(
                text = credential.label,
                color = HudWhite,
                fontSize = 14.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            // API Key (masked)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (showApiKey) "sk-••••••••••••" else "••••••••••••••••",
                    color = HudText,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f)
                )

                IconButton(
                    onClick = { showApiKey = !showApiKey },
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = if (showApiKey) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (showApiKey) "Hide" else "Show",
                        tint = HudText,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Created date
            Text(
                text = "Created: ${java.text.SimpleDateFormat("MMM d, yyyy", java.util.Locale.getDefault()).format(java.util.Date(credential.createdAt))}",
                color = HudGray,
                fontSize = 10.sp
            )
        }
    }
}

@Composable
private fun EmptyCredentialsState(
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
                imageVector = Icons.Default.Key,
                contentDescription = null,
                tint = HudGray,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "NO CREDENTIALS",
                color = HudText,
                fontSize = 14.sp,
                letterSpacing = 2.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Add API keys for your AI providers",
                color = HudGray,
                fontSize = 12.sp
            )

            Spacer(modifier = Modifier.height(24.dp))

            HudTextButton(
                onClick = onCreateClick,
                text = "ADD CREDENTIAL",
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
private fun CreateCredentialDialog(
    onDismiss: () -> Unit,
    onCreate: (provider: ProviderKey, label: String, apiKey: String) -> Unit,
    isCreating: Boolean
) {
    var provider by remember { mutableStateOf(ProviderKey.ANTHROPIC) }
    var label by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }

    val providerOptions = listOf(
        SelectOption(ProviderKey.ANTHROPIC, "Anthropic", "Claude API"),
        SelectOption(ProviderKey.OPENAI, "OpenAI", "GPT API"),
        SelectOption(ProviderKey.GOOGLE, "Google", "Gemini API"),
        SelectOption(ProviderKey.GROQ, "Groq", "Groq API"),
        SelectOption(ProviderKey.OPENROUTER, "OpenRouter", "Multi-provider")
    )

    HudDialog(
        onDismiss = onDismiss,
        title = "New Credential",
        icon = Icons.Default.Key,
        actions = {
            HudTextButton(
                onClick = onDismiss,
                text = "Cancel",
                variant = HudButtonVariant.GHOST,
                enabled = !isCreating
            )
            Spacer(modifier = Modifier.width(8.dp))
            HudTextButton(
                onClick = { onCreate(provider, label, apiKey) },
                text = if (isCreating) "Adding..." else "Add",
                enabled = !isCreating && label.isNotBlank() && apiKey.isNotBlank(),
                trailingIcon = if (isCreating) {
                    { HudSpinner(size = 16.dp) }
                } else null
            )
        }
    ) {
        Column {
            HudSelect(
                options = providerOptions,
                selectedValue = provider,
                onValueChange = { provider = it },
                label = "Provider"
            )

            Spacer(modifier = Modifier.height(16.dp))

            HudInput(
                value = label,
                onValueChange = { label = it },
                label = "Label",
                placeholder = "My API Key"
            )

            Spacer(modifier = Modifier.height(16.dp))

            HudInput(
                value = apiKey,
                onValueChange = { apiKey = it },
                label = "API Key",
                placeholder = "sk-...",
                isPassword = true
            )
        }
    }
}
