package uk.adedamola.aperture.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class AgentType {
    @SerialName("claude_sdk") CLAUDE_SDK,
    @SerialName("pi_sdk") PI_SDK
}

@Serializable
enum class AuthMode {
    @SerialName("api_key") API_KEY,
    @SerialName("oauth") OAUTH
}

@Serializable
enum class ApiKeyRef {
    @SerialName("inline") INLINE,
    @SerialName("stored") STORED,
    @SerialName("none") NONE
}

@Serializable
enum class ProviderKey {
    @SerialName("anthropic") ANTHROPIC,
    @SerialName("openai") OPENAI,
    @SerialName("google") GOOGLE,
    @SerialName("groq") GROQ,
    @SerialName("openrouter") OPENROUTER
}

@Serializable
enum class ConnectionStatus {
    @SerialName("disconnected") DISCONNECTED,
    @SerialName("connecting") CONNECTING,
    @SerialName("connected") CONNECTED,
    @SerialName("reconnecting") RECONNECTING,
    @SerialName("error") ERROR,
    @SerialName("ended") ENDED
}

@Serializable
enum class PermissionMode {
    @SerialName("default") DEFAULT,
    @SerialName("acceptEdits") ACCEPT_EDITS,
    @SerialName("bypassPermissions") BYPASS_PERMISSIONS,
    @SerialName("plan") PLAN,
    @SerialName("delegate") DELEGATE,
    @SerialName("dontAsk") DONT_ASK
}

@Serializable
enum class MessageRole {
    @SerialName("user") USER,
    @SerialName("assistant") ASSISTANT,
    @SerialName("system") SYSTEM
}

@Serializable
enum class ImageMimeType {
    @SerialName("image/jpeg") JPEG,
    @SerialName("image/png") PNG,
    @SerialName("image/gif") GIF,
    @SerialName("image/webp") WEBP
}

// Claude SDK enums
@Serializable
enum class HookEvent {
    @SerialName("PreToolUse") PRE_TOOL_USE,
    @SerialName("PostToolUse") POST_TOOL_USE,
    @SerialName("PostToolUseFailure") POST_TOOL_USE_FAILURE,
    @SerialName("Notification") NOTIFICATION,
    @SerialName("UserPromptSubmit") USER_PROMPT_SUBMIT,
    @SerialName("SessionStart") SESSION_START,
    @SerialName("SessionEnd") SESSION_END,
    @SerialName("Stop") STOP,
    @SerialName("SubagentStart") SUBAGENT_START,
    @SerialName("SubagentStop") SUBAGENT_STOP,
    @SerialName("PreCompact") PRE_COMPACT,
    @SerialName("PermissionRequest") PERMISSION_REQUEST,
    @SerialName("Setup") SETUP
}

@Serializable
enum class AgentModel {
    @SerialName("sonnet") SONNET,
    @SerialName("opus") OPUS,
    @SerialName("haiku") HAIKU,
    @SerialName("inherit") INHERIT
}

@Serializable
enum class PermissionBehavior {
    @SerialName("allow") ALLOW,
    @SerialName("deny") DENY,
    @SerialName("ask") ASK
}

@Serializable
enum class PermissionUpdateType {
    @SerialName("addRules") ADD_RULES,
    @SerialName("replaceRules") REPLACE_RULES,
    @SerialName("removeRules") REMOVE_RULES,
    @SerialName("setMode") SET_MODE,
    @SerialName("addDirectories") ADD_DIRECTORIES,
    @SerialName("removeDirectories") REMOVE_DIRECTORIES
}

@Serializable
enum class PermissionDestination {
    @SerialName("userSettings") USER_SETTINGS,
    @SerialName("projectSettings") PROJECT_SETTINGS,
    @SerialName("localSettings") LOCAL_SETTINGS,
    @SerialName("session") SESSION,
    @SerialName("cliArg") CLI_ARG
}

@Serializable
enum class ResultSubtype {
    @SerialName("success") SUCCESS,
    @SerialName("error_during_execution") ERROR_DURING_EXECUTION,
    @SerialName("error_max_turns") ERROR_MAX_TURNS,
    @SerialName("error_max_budget_usd") ERROR_MAX_BUDGET_USD,
    @SerialName("error_max_structured_output_retries") ERROR_MAX_STRUCTURED_OUTPUT_RETRIES
}

// Pi SDK enums
@Serializable
enum class PiThinkingLevel {
    @SerialName("off") OFF,
    @SerialName("minimal") MINIMAL,
    @SerialName("low") LOW,
    @SerialName("medium") MEDIUM,
    @SerialName("high") HIGH,
    @SerialName("xhigh") XHIGH
}

@Serializable
enum class PiSessionMode {
    @SerialName("inMemory") IN_MEMORY,
    @SerialName("create") CREATE,
    @SerialName("continueRecent") CONTINUE_RECENT,
    @SerialName("open") OPEN
}

@Serializable
enum class PiToolSet {
    @SerialName("codingTools") CODING_TOOLS,
    @SerialName("readOnlyTools") READ_ONLY_TOOLS,
    @SerialName("custom") CUSTOM
}

@Serializable
enum class PiProvider {
    @SerialName("anthropic") ANTHROPIC,
    @SerialName("openai") OPENAI,
    @SerialName("google") GOOGLE,
    @SerialName("groq") GROQ,
    @SerialName("openrouter") OPENROUTER
}

@Serializable
enum class McpServerStatus {
    @SerialName("connected") CONNECTED,
    @SerialName("failed") FAILED,
    @SerialName("needs-auth") NEEDS_AUTH,
    @SerialName("pending") PENDING
}
