const API_BASE = "/api/backend";
const COLLECTOR_BASE = "/api/collector";
const THREAT_INTEL_BASE = "/api/threat-intel";
const ADAPTIVE_BASE = "/api/adaptive";
const INTENT_BASE = "/api/intent";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

export const api = {
  // Sessions
  getSessions: (params?: { status?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.limit) search.set('limit', params.limit.toString());
    if (params?.offset) search.set('offset', params.offset.toString());
    return fetchJson<{ sessions: any[]; total: number }>(`${API_BASE}/sessions?${search}`);
  },

  getSession: (sessionId: string) =>
    fetchJson<any>(`${API_BASE}/sessions/${sessionId}`),

  getSessionCommands: (sessionId: string) =>
    fetchJson<{ commands: any[] }>(`${API_BASE}/sessions/${sessionId}/commands`),

  getSessionAuth: (sessionId: string) =>
    fetchJson<{ auth_events: any[] }>(`${API_BASE}/sessions/${sessionId}/auth`),

  // Stats
  getStats: (hours?: number) => {
    const url = new URL(`${API_BASE}/stats`, window.location.origin);
    if (hours) url.searchParams.set('hours', hours.toString());
    return fetchJson<any>(url.toString());
  },

  // Connection health check
  checkConnection: async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) {
        return {
          connected: false,
          status: 'error',
          clickhouse: 'unknown',
          postgres: 'unknown',
          redis: 'unknown',
          timestamp: new Date().toISOString(),
          error: `HTTP ${response.status}`,
          lastChecked: Date.now(),
        };
      }
      const data = await response.json();
      return {
        connected: data.status === 'healthy' || data.status === 'degraded',
        status: data.status,
        clickhouse: data.clickhouse,
        postgres: data.postgres,
        redis: data.redis,
        timestamp: data.timestamp,
        lastChecked: Date.now(),
      };
    } catch (error) {
      return {
        connected: false,
        status: 'error',
        clickhouse: 'unknown',
        postgres: 'unknown',
        redis: 'unknown',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: Date.now(),
      };
    }
  },

  // Threat Intelligence
  getThreatIntel: (sessionId: string) =>
    fetchJson<any>(`${THREAT_INTEL_BASE}/analyze/by-session/${sessionId}`),

  // Adaptive Engine
  getAdaptations: (sessionId: string) =>
    fetchJson<{ adaptations: any[] }>(`${ADAPTIVE_BASE}/adaptations/${sessionId}`),

  // Intent Engine
  getIntentHistory: (sessionId: string) =>
    fetchJson<{ intents: any[] }>(`${INTENT_BASE}/sessions/${sessionId}/intents`),

  // Collector
  getCollectorHealth: () =>
    fetchJson<any>(`${COLLECTOR_BASE}/health`),

  // Real-time events (SSE)
  subscribeToEvents: (onEvent: (event: any) => void) => {
    const eventSource = new EventSource(`${COLLECTOR_BASE}/events/stream`);
    eventSource.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
    };
    return () => eventSource.close();
  },
};