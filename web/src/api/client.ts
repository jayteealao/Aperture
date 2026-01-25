// HTTP API Client for Aperture Gateway

import type {
  CreateSessionRequest,
  Session,
  SessionStatus,
  ListSessionsResponse,
  Credential,
  CreateCredentialRequest,
  ListCredentialsResponse,
  HealthResponse,
  ReadyResponse,
  MessagesResponse,
  JsonRpcMessage,
  CreateWorkspaceRequest,
  WorkspaceRecord,
  ListWorkspacesResponse,
  ListWorkspaceAgentsResponse,
  ListWorktreesResponse,
  DiscoveryResult,
  CloneWorkspaceRequest,
  CloneWorkspaceResponse,
  InitRepoRequest,
  InitRepoResponse,
} from './types'

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

class ApertureClient {
  private baseUrl: string = ''
  private token: string = ''

  configure(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.token = token
  }

  getBaseUrl() {
    return this.baseUrl
  }

  getToken() {
    return this.token
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...(options.headers || {}),
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let errorData: unknown
      try {
        errorData = await response.json()
      } catch {
        errorData = { error: response.statusText }
      }
      const message =
        (errorData as { message?: string; error?: string })?.message ||
        (errorData as { error?: string })?.error ||
        response.statusText
      throw new ApiError(message, response.status, errorData)
    }

    if (response.status === 204) {
      return null as T
    }

    return response.json()
  }

  // Health checks
  async checkHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/healthz')
  }

  async checkReady(): Promise<ReadyResponse> {
    return this.request<ReadyResponse>('/readyz')
  }

  // Sessions
  async createSession(config: CreateSessionRequest): Promise<Session> {
    return this.request<Session>('/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  async getSession(sessionId: string): Promise<SessionStatus> {
    return this.request<SessionStatus>(`/v1/sessions/${sessionId}`)
  }

  async listSessions(): Promise<ListSessionsResponse> {
    return this.request<ListSessionsResponse>('/v1/sessions')
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.request<void>(`/v1/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  }

  async getSessionMessages(
    sessionId: string,
    limit = 1000,
    offset = 0
  ): Promise<MessagesResponse> {
    return this.request<MessagesResponse>(
      `/v1/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`
    )
  }

  async sendRpc(sessionId: string, message: JsonRpcMessage): Promise<unknown> {
    return this.request<unknown>(`/v1/sessions/${sessionId}/rpc`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  // Credentials
  async createCredential(data: CreateCredentialRequest): Promise<Credential> {
    return this.request<Credential>('/v1/credentials', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listCredentials(): Promise<ListCredentialsResponse> {
    return this.request<ListCredentialsResponse>('/v1/credentials')
  }

  async deleteCredential(id: string): Promise<void> {
    return this.request<void>(`/v1/credentials/${id}`, {
      method: 'DELETE',
    })
  }

  // WebSocket URL helper
  getWebSocketUrl(sessionId: string): string {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws')
    return `${wsUrl}/v1/sessions/${sessionId}/ws?token=${encodeURIComponent(this.token)}`
  }

  // Workspaces
  async createWorkspace(data: CreateWorkspaceRequest): Promise<WorkspaceRecord> {
    return this.request<WorkspaceRecord>('/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async listWorkspaces(): Promise<ListWorkspacesResponse> {
    return this.request<ListWorkspacesResponse>('/v1/workspaces')
  }

  async getWorkspace(id: string): Promise<WorkspaceRecord> {
    return this.request<WorkspaceRecord>(`/v1/workspaces/${id}`)
  }

  async deleteWorkspace(id: string): Promise<void> {
    return this.request<void>(`/v1/workspaces/${id}`, {
      method: 'DELETE',
    })
  }

  async listWorkspaceAgents(workspaceId: string): Promise<ListWorkspaceAgentsResponse> {
    return this.request<ListWorkspaceAgentsResponse>(`/v1/workspaces/${workspaceId}/agents`)
  }

  async deleteWorkspaceAgent(workspaceId: string, agentId: string): Promise<void> {
    return this.request<void>(`/v1/workspaces/${workspaceId}/agents/${agentId}`, {
      method: 'DELETE',
    })
  }

  async listWorkspaceWorktrees(workspaceId: string): Promise<ListWorktreesResponse> {
    return this.request<ListWorktreesResponse>(`/v1/workspaces/${workspaceId}/worktrees`)
  }

  // Discovery
  async discoverRepos(path: string): Promise<DiscoveryResult> {
    return this.request<DiscoveryResult>('/v1/discovery/scan', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  }

  async cloneWorkspace(data: CloneWorkspaceRequest): Promise<CloneWorkspaceResponse> {
    return this.request<CloneWorkspaceResponse>('/v1/workspaces/clone', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async initRepo(data: InitRepoRequest): Promise<InitRepoResponse> {
    return this.request<InitRepoResponse>('/v1/workspaces/init', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }
}

export const api = new ApertureClient()
export { ApiError }
