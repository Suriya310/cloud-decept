const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const COLLECTOR_BASE = process.env.NEXT_PUBLIC_COLLECTOR_URL || 'http://localhost:8000';
const THREAT_INTEL_BASE = process.env.NEXT_PUBLIC_THREAT_INTEL_URL || 'http://localhost:8005';
const ADAPTIVE_BASE = process.env.NEXT_PUBLIC_ADAPTIVE_URL || 'http://localhost:8002';
const INTENT_BASE = process.env.NEXT_PUBLIC_INTENT_URL || 'http://localhost:8001';

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
  getStats: () =>
    fetchJson<any>(`${API_BASE}/stats`),

  getStatsSummary: () =>
    fetchJson<any>(`${API_BASE}/stats/summary`),

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