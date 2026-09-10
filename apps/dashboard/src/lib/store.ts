import { create } from 'zustand';
import {
  DashboardState,
  Session,
  Command,
  AuthEvent,
  ThreatIntelligenceEvent,
  ThreatIntelItem,
  MitreTechniqueCount,
  TopCommand,
  TopAttacker,
  Stats,
  RealTimeEvent,
} from './types';
import { api } from './api';

interface ConnectionStatus {
  connected: boolean;
  status: string;
  clickhouse: string;
  postgres: string;
  redis: string;
  timestamp: string;
  error?: string;
  lastChecked: number;
}

interface DashboardActions {
  // Sessions
  fetchSessions: (params?: { status?: string; limit?: number; offset?: number; hours?: number; intent?: string; min_skill_level?: number }) => Promise<void>;
  fetchSession: (sessionId: string) => Promise<void>;
  fetchSessionCommands: (sessionId: string) => Promise<void>;
  fetchSessionAuth: (sessionId: string) => Promise<void>;
  fetchSessionThreatIntel: (sessionId: string) => Promise<void>;
  searchSessions: (query: string) => Promise<void>;
  setSelectedSession: (session: Session | null) => void;

  // Analytics & Threat Intelligence
  fetchThreatIntelItems: (params?: { limit?: number; severity?: string; ioc_type?: string }) => Promise<void>;
  fetchMitreTechniques: () => Promise<void>;
  fetchTopCommands: (hours?: number, limit?: number) => Promise<void>;
  fetchTopAttackers: (hours?: number, limit?: number) => Promise<void>;

  // Stats
  fetchStats: (hours?: number) => Promise<void>;
  fetchAllTimeStats: () => Promise<void>;

  // Connection status
  fetchConnectionStatus: () => Promise<ConnectionStatus>;
  connectionStatus: ConnectionStatus | null;

  // Real-time events
  addRealTimeEvent: (event: RealTimeEvent) => void;
  clearRealTimeEvents: () => void;
  setConnected: (connected: boolean) => void;

  // Filters
  setFilters: (filters: Partial<DashboardState['filters']>) => void;
  resetFilters: () => void;

  // Subscriptions
  subscribeToEvents: () => () => void;
}

const defaultFilters = {
  status: 'all',
  intent: 'all',
  country: 'all',
  dateRange: [undefined, undefined] as [Date | undefined, Date | undefined],
};

// Transform backend session data to include UI-compatible fields
export function transformSession(s: any): Session {
  if (!s || typeof s !== 'object') {
    return {
      session_id: '',
      attacker_ip: '',
      start_time: new Date().toISOString(),
      commands_executed: 0,
    } as Session;
  }
  // A session is closed only if it has an explicit end_time different from start_time with duration or disconnect reason
  const isClosed = Boolean(
    s.end_time &&
    !String(s.end_time).startsWith('1970') &&
    s.end_time !== s.start_time &&
    (s.duration_seconds > 0 || (s.duration && s.duration > 0) || s.disconnection_reason)
  );
  return {
    ...s,
    src_ip: s.attacker_ip || s.src_ip || '',
    src_country: s.country || s.src_country || '',
    command_count: s.commands_executed ?? s.command_count ?? 0,
    intent_history: s.intent ? [s.intent] : (s.intent_history || []),
    skill_level: typeof s.skill_level === 'number' ? s.skill_level : 0,
    threat_score: typeof s.skill_level === 'number' ? s.skill_level : 0,
    tactics: s.tactics || [],
    status: isClosed ? 'closed' : 'active',
    auth_success: s.credentials_tried && s.credentials_tried > 0 ? ((s.commands_executed ?? 0) > 0) : undefined,
  };
}

let statsFetchPromise: Promise<any> | null = null;

export const useDashboardStore = create<DashboardState & DashboardActions>((set, get) => ({
  // State
  sessions: [],
  selectedSession: null,
  commands: [],
  sessionAuth: [],
  threatIntel: null,
  threatIntelItems: [],
  mitreTechniques: [],
  topCommands: [],
  topAttackers: [],
  stats: null,
  statsLoading: false,
  statsError: null,
  sessionsLoading: false,
  sessionsError: null,
  realTimeEvents: [],
  isConnected: false,
  connectionStatus: null,
  filters: defaultFilters,

  // Actions
  fetchSessions: async (params) => {
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const data = await api.getSessions(params);
      const transformed = (data.sessions || []).map(transformSession);
      set({ sessions: transformed, sessionsLoading: false, sessionsError: null });
    } catch (error: any) {
      console.error('Failed to fetch sessions:', error);
      set({ sessions: [], sessionsLoading: false, sessionsError: error?.message || 'Failed to load sessions' });
    }
  },

  fetchSession: async (sessionId) => {
    try {
      const session = await api.getSession(sessionId);
      set({ selectedSession: transformSession(session) });
    } catch (error) {
      console.error('Failed to fetch session:', error);
      set({ selectedSession: null });
    }
  },

  fetchSessionCommands: async (sessionId) => {
    try {
      const data = await api.getSessionCommands(sessionId);
      set({ commands: data.commands || [] });
    } catch (error) {
      console.error('Failed to fetch commands:', error);
      set({ commands: [] });
    }
  },

  fetchSessionAuth: async (sessionId) => {
    try {
      const data = await api.getSessionAuth(sessionId);
      set({ sessionAuth: data.auth_events || [] });
    } catch (error) {
      console.error('Failed to fetch auth:', error);
      set({ sessionAuth: [] });
    }
  },

  fetchSessionThreatIntel: async (sessionId) => {
    try {
      const data = await api.getThreatIntel(sessionId);
      set({ threatIntel: data });
    } catch (error) {
      console.error('Failed to fetch threat intel:', error);
      set({ threatIntel: null });
    }
  },

  searchSessions: async (query: string) => {
    try {
      if (!query || query.trim() === '') {
        await get().fetchSessions();
        return;
      }
      const data = await api.searchSessions(query.trim(), 50);
      set({ sessions: (data || []).map(transformSession) });
    } catch (error) {
      console.error('Failed to search sessions:', error);
    }
  },

  fetchThreatIntelItems: async (params) => {
    try {
      const items = await api.listThreatIntel(params);
      set({ threatIntelItems: items });
    } catch (error) {
      console.error('Failed to fetch threat intel items:', error);
      set({ threatIntelItems: [] });
    }
  },

  fetchMitreTechniques: async () => {
    try {
      const techniques = await api.getMitreTechniques();
      set({ mitreTechniques: techniques });
    } catch (error) {
      console.error('Failed to fetch MITRE techniques:', error);
      set({ mitreTechniques: [] });
    }
  },

  fetchTopCommands: async (hours = 24, limit = 20) => {
    try {
      const top = await api.getTopCommands({ hours, limit });
      set({ topCommands: top });
    } catch (error) {
      console.error('Failed to fetch top commands:', error);
      set({ topCommands: [] });
    }
  },

  fetchTopAttackers: async (hours = 168, limit = 20) => {
    try {
      const top = await api.getTopAttackers({ hours, limit });
      set({ topAttackers: top });
    } catch (error) {
      console.error('Failed to fetch top attackers:', error);
      set({ topAttackers: [] });
    }
  },

  setSelectedSession: (session) => {
    set({ selectedSession: session });
    if (session) {
      get().fetchSessionCommands(session.session_id);
      get().fetchSessionAuth(session.session_id);
      get().fetchSessionThreatIntel(session.session_id);
    } else {
      set({ commands: [], sessionAuth: [], threatIntel: null });
    }
  },

  fetchStats: async (hours: number = 24) => {
    // If a fetch is already in flight, return the shared promise
    if (statsFetchPromise) {
      return statsFetchPromise;
    }
    set({ statsLoading: true, statsError: null });
    statsFetchPromise = (async () => {
      try {
        const rawData = await api.getStats(hours);
        const data = (rawData as any)?.stats || (rawData as any)?.data || rawData;
        console.log("[CloudDecept] STATS FETCHED", data);
        set({ stats: data, statsLoading: false, statsError: null });
        return data;
      } catch (error: any) {
        console.error('[CloudDecept] STATS FETCH ERROR:', error);
        set({ statsLoading: false, statsError: error?.message || 'Failed to load statistics' });
      } finally {
        statsFetchPromise = null;
      }
    })();
    return statsFetchPromise;
  },

  fetchAllTimeStats: async () => {
    return get().fetchStats(24);
  },

  // Unified connection status
  fetchConnectionStatus: async () => {
    try {
      const status = await api.checkConnection();
      set({
        connectionStatus: status,
        isConnected: status.connected,
      });
      return status;
    } catch (error) {
      const status: ConnectionStatus = {
        connected: false,
        status: 'error',
        clickhouse: 'unknown',
        postgres: 'unknown',
        redis: 'unknown',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: Date.now(),
      };
      set({ connectionStatus: status, isConnected: false });
      return status;
    }
  },

  addRealTimeEvent: (event) => {
    set((state) => ({
      realTimeEvents: [event, ...state.realTimeEvents].slice(0, 100),
    }));
  },

  clearRealTimeEvents: () => {
    set({ realTimeEvents: [] });
  },

  setConnected: (connected) => {
    set({ isConnected: connected });
  },

  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
    get().fetchSessions({ status: filters.status, intent: filters.intent });
  },

  resetFilters: () => {
    set({ filters: defaultFilters });
    get().fetchSessions();
  },

  subscribeToEvents: () => {
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = api.subscribeToEvents((event) => {
        get().addRealTimeEvent(event);
      });
    } catch (error) {
      console.error('Failed to subscribe to events:', error);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  },
}));