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
  // Global Commands & Auth
  fetchGlobalCommands: (params?: { limit?: number; offset?: number; session_id?: string; command?: string; attacker_ip?: string; intent?: string; hours?: number; include_synthetic?: boolean }) => Promise<void>;
  fetchGlobalAuth: (params?: { limit?: number; offset?: number; session_id?: string; username?: string; success?: boolean; hours?: number }) => Promise<void>;

  // Sessions
  fetchSessions: (params?: { status?: string; limit?: number; offset?: number; hours?: number; intent?: string; min_skill_level?: number; attacker_ip?: string; session_id?: string; has_commands?: boolean; auth_success?: boolean }) => Promise<void>;
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
  fetchTopAttackers: (hours?: number, limit?: number, sort_by?: string) => Promise<void>;

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
  setLiveConnected: (connected: boolean) => void;

  // Filters
  setFilters: (filters: Partial<DashboardState['filters']>) => void;
  resetFilters: () => void;

  // Subscriptions
  subscribeToEvents: () => () => void;

  // Time Window Control
  timeWindowHours: number;
  setTimeWindowHours: (hours: number) => void;
}

const defaultFilters = {
  status: 'all',
  intent: 'all',
  country: 'all',
  dateRange: [undefined, undefined] as [Date | undefined, Date | undefined],
};

// Transform backend session data to include UI-compatible fields with accurate lifecycle status
export function transformSession(s: any): Session {
  if (!s || typeof s !== 'object') {
    return {
      session_id: '',
      attacker_ip: '',
      start_time: new Date().toISOString(),
      commands_executed: 0,
      status: 'closed',
    } as Session;
  }

  const startTimeMs = s.start_time ? new Date(s.start_time).getTime() : Date.now();
  const nowMs = Date.now();
  const ageSeconds = Math.max(0, Math.floor((nowMs - startTimeMs) / 1000));

  const hasExplicitEnd = Boolean(
    s.end_time &&
    !String(s.end_time).startsWith('1970') &&
    s.end_time !== s.start_time &&
    (s.duration_seconds > 0 || (s.duration && s.duration > 0) || s.disconnection_reason)
  );

  // Separate authentication outcome from TCP transport lifecycle
  let authSuccess: boolean | undefined = undefined;
  if (s.auth_success !== undefined && s.auth_success !== null) {
    authSuccess = Boolean(s.auth_success);
  } else if ((s.commands_executed ?? 0) > 0) {
    authSuccess = true; // Commands executed in Cowrie required interactive shell access
  } else if ((s.credentials_tried ?? 0) > 0) {
    authSuccess = false; // Credentials probed without recorded command activity or explicit success
  }

  let status: 'active' | 'closed' | 'failed' | 'timed_out' | 'stale' = 'closed';

  if (s.status === 'failed' || authSuccess === false) {
    status = 'failed';
  } else if (hasExplicitEnd) {
    status = 'closed';
  } else {
    // No explicit end time recorded
    if (ageSeconds < 300) {
      status = 'active';
    } else if (ageSeconds < 3600) {
      status = 'timed_out';
    } else {
      status = 'stale';
    }
  }

  return {
    ...s,
    src_ip: s.attacker_ip || s.src_ip || '',
    src_country: s.country || s.src_country || '',
    command_count: s.commands_executed ?? s.command_count ?? 0,
    intent_history: s.intent ? [s.intent] : (s.intent_history || []),
    skill_level: typeof s.skill_level === 'number' ? s.skill_level : 0,
    threat_score: typeof s.skill_level === 'number' ? s.skill_level : 0,
    tactics: s.tactics || [],
    status,
    auth_success: authSuccess,
  };
}

let statsFetchPromise: Promise<any> | null = null;

let eventBuffer: RealTimeEvent[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;

export const useDashboardStore = create<DashboardState & DashboardActions>((set, get) => ({
  // State
  sessions: [],
  selectedSession: null,
  commands: [],
  sessionAuth: [],
  globalCommands: [],
  globalCommandsLoading: false,
  globalAuth: [],
  globalAuthLoading: false,
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
  isLiveConnected: false,
  liveEventCount: 0,
  connectionStatus: null,
  filters: defaultFilters,
  timeWindowHours: 24,

  // Actions
  fetchGlobalCommands: async (params) => {
    set({ globalCommandsLoading: true });
    try {
      const data = await api.getCommands(params);
      set({ globalCommands: data || [], globalCommandsLoading: false });
    } catch (e) {
      console.error('Failed to fetch global commands:', e);
      set({ globalCommands: [], globalCommandsLoading: false });
    }
  },

  fetchGlobalAuth: async (params) => {
    set({ globalAuthLoading: true });
    try {
      const data = await api.getAuthAttempts(params);
      set({ globalAuth: data || [], globalAuthLoading: false });
    } catch (e) {
      console.error('Failed to fetch global auth:', e);
      set({ globalAuth: [], globalAuthLoading: false });
    }
  },
  setTimeWindowHours: (hours) => {
    set({ timeWindowHours: hours });
    get().fetchStats(hours);
  },
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

  fetchTopAttackers: async (hours = 168, limit = 20, sort_by?: string) => {
    try {
      const top = await api.getTopAttackers({ hours, limit, sort_by });
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
    if (typeof window !== 'undefined') {


    }
    // If a fetch is already in flight, return the shared promise
    if (statsFetchPromise) {
      return statsFetchPromise;
    }
    set({ statsLoading: true, statsError: null });
    statsFetchPromise = (async () => {
      try {
        const rawData = await api.getStats(hours);
        if (typeof window !== 'undefined') {

        }
        const data = (rawData as any)?.stats || (rawData as any)?.data || rawData;
        if (typeof window !== 'undefined') {

        }
        set({ stats: data, statsLoading: false, statsError: null });
        if (typeof window !== 'undefined') {

        }
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
    // Ignore internal connection events from the backend
    if (event && (event as any).type === "connected") return;
    
    eventBuffer.push(event);
    
    // STRICT RAW BUFFER BOUNDS (Phase 13 Final Validation)
    if (eventBuffer.length > 500) {
      eventBuffer = eventBuffer.slice(-100);
    }
    
    set(state => ({ liveEventCount: state.liveEventCount + 1 }));
    
    if (!batchTimeout) {
      batchTimeout = setTimeout(() => {
        // Prevent buffer from growing unbounded if interval is delayed
        const toAdd = eventBuffer.slice(-100).reverse(); // take most recent 100, newest first
        set((state) => ({
          realTimeEvents: [...toAdd, ...state.realTimeEvents].slice(0, 100),
        }));
        eventBuffer = [];
        batchTimeout = null;
      }, 500); // 500ms batching interval
    }
  },

  clearRealTimeEvents: () => {
    set({ realTimeEvents: [] });
  },

  setLiveConnected: (connected) => {
    set({ isLiveConnected: connected });
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
      unsubscribe = api.subscribeToEvents(
        (event) => get().addRealTimeEvent(event),
        () => get().setLiveConnected(true),
        () => get().setLiveConnected(false)
      );
    } catch (error) {
      console.error('Failed to subscribe to events:', error);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  },
}));
