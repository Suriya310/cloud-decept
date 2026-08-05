export interface Session {
  session_id: string;
  src_ip: string;
  src_country?: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  username?: string;
  password?: string;
  auth_success: boolean;
  status: 'active' | 'closed';
  command_count: number;
  intent_history: string[];
  threat_score: number;
  tactics: string[];
}

export interface Command {
  id: string;
  session_id: string;
  timestamp: string;
  command: string;
  output?: string;
  success: boolean;
  intent?: string;
  intent_confidence?: number;
  mitre_techniques?: string[];
}

export interface AuthEvent {
  session_id: string;
  timestamp: string;
  username: string;
  password: string;
  success: boolean;
  src_ip: string;
  src_port: number;
}

export interface ThreatIntelligenceEvent {
  session_id: string;
  timestamp: string;
  iocs: IOC[];
  techniques: Technique[];
  tactic_summary: Record<string, number>;
  summary?: SessionSummary;
}

export interface IOC {
  type: string;
  value: string;
  context: string;
  confidence: number;
  first_seen: string;
}

export interface Technique {
  technique_id: string;
  name: string;
  tactic: string;
  severity: string;
  trigger: string;
  confidence: number;
}

export interface SessionSummary {
  skill_level: number;
  primary_objective: string;
  techniques_summary: string;
  iocs_of_interest: string[];
  risk_level: string;
  defensive_recommendations: string[];
  narrative: string;
  generated_at: string;
  model: string;
}

export interface AdaptationEvent {
  session_id: string;
  timestamp: string;
  intent: string;
  strategy: string;
  action: string;
  success: boolean;
  details: Record<string, unknown>;
}

export interface Stats {
  total_sessions: number;
  active_sessions: number;
  total_commands: number;
  unique_attackers: number;
  top_intents: { intent: string; count: number }[];
  top_countries: { country: string; count: number }[];
  recent_sessions: Session[];
  threat_distribution: { level: string; count: number }[];
}

export interface RealTimeEvent {
  type: 'session_start' | 'session_end' | 'command' | 'auth' | 'intent' | 'adaptation' | 'threat_intel';
  timestamp: string;
  data: unknown;
}

export interface DashboardState {
  sessions: Session[];
  selectedSession: Session | null;
  commands: Command[];
  threatIntel: ThreatIntelligenceEvent | null;
  stats: Stats | null;
  realTimeEvents: RealTimeEvent[];
  isConnected: boolean;
  filters: {
    status: string;
    intent: string;
    country: string;
    dateRange: [Date | undefined, Date | undefined];
  };
}