package uk.adedamola.aperture.domain.model.sdk

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import uk.adedamola.aperture.domain.model.AgentModel
import uk.adedamola.aperture.domain.model.HookEvent
import uk.adedamola.aperture.domain.model.McpServerStatus
import uk.adedamola.aperture.domain.model.PermissionBehavior
import uk.adedamola.aperture.domain.model.PermissionDestination
import uk.adedamola.aperture.domain.model.PermissionMode
import uk.adedamola.aperture.domain.model.PermissionUpdateType
import uk.adedamola.aperture.domain.model.ResultSubtype

// MCP Server configurations
@Serializable
sealed class McpServerConfig {
    @Serializable
    @SerialName("stdio")
    data class Stdio(
        val type: String = "stdio",
        val command: String,
        val args: List<String>? = null,
        val env: Map<String, String>? = null
    ) : McpServerConfig()

    @Serializable
    @SerialName("sse")
    data class Sse(
        val type: String = "sse",
        val url: String,
        val headers: Map<String, String>? = null
    ) : McpServerConfig()

    @Serializable
    @SerialName("http")
    data class Http(
        val type: String = "http",
        val url: String,
        val headers: Map<String, String>? = null
    ) : McpServerConfig()
}

@Serializable
data class McpServerInfo(
    val name: String,
    val status: McpServerStatus,
    val serverInfo: ServerVersionInfo? = null,
    val error: String? = null
)

@Serializable
data class ServerVersionInfo(
    val name: String,
    val version: String
)

@Serializable
data class McpSetServersResult(
    val added: List<String>,
    val removed: List<String>,
    val errors: Map<String, String>
)

// Agent definition
@Serializable
data class AgentDefinition(
    val description: String,
    val prompt: String,
    val model: AgentModel? = null,
    val tools: List<String>? = null,
    val disallowedTools: List<String>? = null,
    val maxTurns: Int? = null,
    val skills: List<String>? = null,
    val mcpServers: List<String>? = null
)

// Sandbox configuration
@Serializable
data class SandboxNetworkConfig(
    val allowedDomains: List<String>? = null,
    val allowUnixSockets: List<String>? = null,
    val allowAllUnixSockets: Boolean? = null,
    val allowLocalBinding: Boolean? = null,
    val httpProxyPort: Int? = null,
    val socksProxyPort: Int? = null
)

@Serializable
data class SandboxConfig(
    val enabled: Boolean? = null,
    val autoAllowBashIfSandboxed: Boolean? = null,
    val allowUnsandboxedCommands: Boolean? = null,
    val network: SandboxNetworkConfig? = null,
    val ignoreViolations: Map<String, List<String>>? = null,
    val excludedCommands: List<String>? = null
)

// Plugin configuration
@Serializable
data class PluginConfig(
    val type: String = "local",
    val path: String
)

// Output format
@Serializable
data class OutputFormat(
    val type: String = "json_schema",
    val schema: JsonElement
)

// Hook callback matcher
@Serializable
data class HookCallbackMatcher(
    val matcher: String? = null,
    val timeout: Int? = null
)

// System prompt preset
@Serializable
sealed class SystemPromptConfig {
    @Serializable
    @SerialName("string")
    data class Custom(val value: String) : SystemPromptConfig()

    @Serializable
    @SerialName("preset")
    data class Preset(
        val type: String = "preset",
        val preset: String = "claude_code",
        val append: String? = null
    ) : SystemPromptConfig()
}

// SDK Session configuration
@Serializable
data class SdkSessionConfig(
    val resume: String? = null,
    val resumeSessionAt: String? = null,
    val forkSession: Boolean? = null,
    @SerialName("continue")
    val continueSession: Boolean? = null,
    val persistSession: Boolean? = null,
    val enableFileCheckpointing: Boolean? = null,
    val permissionMode: PermissionMode? = null,
    val allowedTools: List<String>? = null,
    val disallowedTools: List<String>? = null,
    val allowDangerouslySkipPermissions: Boolean? = null,
    val maxBudgetUsd: Double? = null,
    val maxTurns: Int? = null,
    val maxThinkingTokens: Int? = null,
    val model: String? = null,
    val fallbackModel: String? = null,
    val betas: List<String>? = null,
    val mcpServers: Map<String, McpServerConfig>? = null,
    val agent: String? = null,
    val agents: Map<String, AgentDefinition>? = null,
    val hookMatchers: Map<HookEvent, List<HookCallbackMatcher>>? = null,
    val sandbox: SandboxConfig? = null,
    val plugins: List<PluginConfig>? = null,
    val outputFormat: OutputFormat? = null,
    val systemPrompt: SystemPromptConfig? = null,
    val additionalDirectories: List<String>? = null,
    val settingSources: List<String>? = null
)

// Model usage statistics
@Serializable
data class ModelUsage(
    val inputTokens: Int,
    val outputTokens: Int,
    val cacheReadInputTokens: Int = 0,
    val cacheCreationInputTokens: Int = 0,
    val webSearchRequests: Int = 0,
    val costUSD: Double = 0.0,
    val contextWindow: Int? = null,
    val maxOutputTokens: Int? = null
)

// Session result
@Serializable
data class SessionResult(
    val success: Boolean,
    val result: String? = null,
    val errors: List<String>? = null,
    val subtype: ResultSubtype,
    val numTurns: Int,
    val durationMs: Long,
    val durationApiMs: Long,
    val totalCostUsd: Double,
    val usage: Map<String, ModelUsage>,
    val structuredOutput: JsonElement? = null,
    val permissionDenials: List<PermissionDenial>
)

@Serializable
data class PermissionDenial(
    val toolName: String,
    val toolInput: Map<String, JsonElement>,
    val message: String
)

// Account info
@Serializable
data class AccountInfo(
    val email: String? = null,
    val organization: String? = null,
    val subscriptionType: String? = null,
    val tokenSource: String? = null,
    val apiKeySource: String? = null
)

// Slash command
@Serializable
data class SlashCommand(
    val name: String,
    val description: String,
    val argumentHint: String
)

// Model info
@Serializable
data class ModelInfo(
    val value: String,
    val displayName: String,
    val description: String
)

// Permission models
@Serializable
data class PermissionOption(
    val optionId: String,
    val name: String,
    val kind: String
)

@Serializable
data class PermissionUpdate(
    val type: PermissionUpdateType,
    val destination: PermissionDestination,
    val behavior: PermissionBehavior,
    val toolName: String? = null,
    val pattern: String? = null,
    val paths: List<String>? = null
)

@Serializable
data class PermissionContext(
    val blockedPath: String? = null,
    val decisionReason: String? = null,
    val agentID: String? = null,
    val suggestions: List<PermissionUpdate>? = null
)

// Rewind files result
@Serializable
data class RewindFilesResult(
    val canRewind: Boolean,
    val error: String? = null,
    val filesChanged: List<String>? = null,
    val insertions: Int? = null,
    val deletions: Int? = null
)
