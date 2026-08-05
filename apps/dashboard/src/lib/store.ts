import { create } from 'zustand';
import { DashboardState, Session, Command, ThreatIntelligenceEvent, Stats, RealTimeEvent } from './types';
import { api } from './api';

interface DashboardActions {
  // Sessions
  fetchSessions: (params?: { status?: string; limit?: number; offset?: number }) => Promise<void>;
  fetchSession: (sessionId: string) => Promise<void>;
  fetchSessionCommands: (sessionId: string) => Promise<void>;
  fetchSessionThreatIntel: (sessionId: string) => Promise<void>;
  setSelectedSession: (session: Session | null) => void;

  // Stats
  fetchStats: () => Promise<void>;

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

export const useDashboardStore = create<DashboardState & DashboardActions>((set, get) => ({
  // State
  sessions: [],
  selectedSession: null,
  commands: [],
  threatIntel: null,
  stats: null,
  realTimeEvents: [],
  isConnected: false,
  filters: defaultFilters,

  // Actions
  fetchSessions: async (params) => {
    try {
      const data = await api.getSessions(params);
      set({ sessions: data.sessions });
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      set({ sessions: [] });
    }
  },

  fetchSession: async (sessionId) => {
    try {
      const session = await api.getSession(sessionId);
      set({ selectedSession: session });
    } catch (error) {
      console.error('Failed to fetch session:', error);
      set({ selectedSession: null });
    }
  },

  fetchSessionCommands: async (sessionId) => {
    try {
      const data = await api.getSessionCommands(sessionId);
      set({ commands: data.commands });
    } catch (error) {
      console.error('Failed to fetch commands:', error);
      set({ commands: [] });
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

  setSelectedSession: (session) => {
    set({ selectedSession: session });
    if (session) {
      get().fetchSessionCommands(session.session_id);
      get().fetchSessionThreatIntel(session.session_id);
    } else {
      set({ commands: [], threatIntel: null });
    }
  },

  fetchStats: async () => {
    try {
      const data = await api.getStats();
      set({ stats: data });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      set({ stats: null });
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
    get().fetchSessions({ status: filters.status });
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
      set({ isConnected: true });
    } catch (error) {
      console.error('Failed to subscribe to events:', error);
      set({ isConnected: false });
    }
    return () => {
      if (unsubscribe) unsubscribe();
      set({ isConnected: false });
    };
  },
}));