// HTTP API Client for Aperture Gateway

import type {
  CreateSessionRequest,
  Session,
  SessionStatus,
  ListSessionsResponse,
  ListResumableSessionsResponse,
  ConnectSessionResponse,
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
  ListWorkspaceCheckoutsResponse,
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
      ...(options.body && { 'Content-Type': 'application/json' }),
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
    return this.request<SessionStatus>(`/v1/sessions/${encodeURIComponent(sessionId)}`)
  }

  async listSessions(): Promise<ListSessionsResponse> {
    return this.request<ListSessionsResponse>('/v1/sessions')
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.request<void>(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })
  }

  async getSessionMessages(
    sessionId: string,
    limit = 1000,
    offset = 0
  ): Promise<MessagesResponse> {
    return this.request<MessagesResponse>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}&offset=${offset}`
    )
  }

  async sendRpc(sessionId: string, message: JsonRpcMessage): Promise<unknown> {
    return this.request<unknown>(`/v1/sessions/${encodeURIComponent(sessionId)}/rpc`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  // Get resumable SDK sessions
  async listResumableSessions(): Promise<ListResumableSessionsResponse> {
    return this.request<ListResumableSessionsResponse>('/v1/sessions/resumable')
  }

  // Connect to a session (restores SDK session if needed)
  async connectSession(sessionId: string): Promise<ConnectSessionResponse> {
    return this.request<ConnectSessionResponse>(`/v1/sessions/${encodeURIComponent(sessionId)}/connect`, {
      method: 'POST',
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
    return this.request<void>(`/v1/credentials/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  // WebSocket URL helper
  getWebSocketUrl(sessionId: string): string {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws')
    return `${wsUrl}/v1/sessions/${encodeURIComponent(sessionId)}/ws?token=${encodeURIComponent(this.token)}`
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
    return this.request<WorkspaceRecord>(`/v1/workspaces/${encodeURIComponent(id)}`)
  }

  async deleteWorkspace(id: string): Promise<void> {
    return this.request<void>(`/v1/workspaces/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  async listWorkspaceCheckouts(workspaceId: string): Promise<ListWorkspaceCheckoutsResponse> {
    return this.request<ListWorkspaceCheckoutsResponse>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/checkouts`)
  }

  async deleteWorkspaceCheckout(workspaceId: string, repoId: string): Promise<void> {
    return this.request<void>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/checkouts/${encodeURIComponent(repoId)}`, {
      method: 'DELETE',
    })
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
