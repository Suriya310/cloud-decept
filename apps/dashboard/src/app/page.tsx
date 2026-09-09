'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Users,
  Terminal,
  MapPin,
  Clock,
  Shield,
  TrendingUp,
  RefreshCw,
  Copy,
  Check,
  Globe,
  Sparkles,
  ExternalLink,
  Flame,
  Radio,
  Crosshair,
  Zap,
  Key,
  ShieldAlert,
} from 'lucide-react';
import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { GeographicMap } from '@/components/GeographicMap';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useDashboardStore } from '@/lib/store';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { evaluateThreat } from '@/lib/threatScore';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function OverviewPage() {
  const {
    stats,
    totalSessions,
    activeSessions,
    totalCommands,
    uniqueAttackers,
    recentCommands24h,
    topCountries,
    topIntents,
    threatDistribution,
    isLoading: statsLoading,
    isError: statsError,
    refresh: refreshStats,
  } = useDashboardStats();

  const {
    sessions,
    fetchSessions,
    connectionStatus,
    fetchConnectionStatus,
    subscribeToEvents,
    realTimeEvents,
    topCommands,
    fetchTopCommands,
  } = useDashboardStore();

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string, key: string) => {
    const success = await safeCopyToClipboard(text);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshStats(),
        fetchSessions({ limit: 50, hours: 8760 }),
        fetchTopCommands(24, 20),
        fetchConnectionStatus(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshStats, fetchSessions, fetchTopCommands, fetchConnectionStatus]);

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToEvents();
    return unsubscribe;
  }, [loadData, subscribeToEvents]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      refreshStats();
      fetchTopCommands(24, 20);
      fetchConnectionStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshStats, fetchTopCommands, fetchConnectionStatus]);

  const sessionsArray = sessions ?? [];
  const realTimeEventsArray = realTimeEvents ?? [];
  const topCommandsArray = topCommands ?? [];

  const isApiHealthy = connectionStatus?.connected ?? false;

  // High risk sessions (threat level high or critical)
  const highRiskSessions = useMemo(() => {
    return sessionsArray
      .map((s) => ({
        session: s,
        threat: evaluateThreat(s.threat_score ?? s.skill_level),
      }))
      .filter((item) => item.threat.isHighRisk)
      .slice(0, 6);
  }, [sessionsArray]);

  // Top Attacker sessions sorted by command count
  const topAttackerSessions = useMemo(() => {
    return [...sessionsArray]
      .filter((s) => s.src_ip || s.attacker_ip)
      .sort((a, b) => (b.command_count || 0) - (a.command_count || 0))
      .slice(0, 6);
  }, [sessionsArray]);

  const highRiskCount = (threatDistribution.critical || 0) + (threatDistribution.high || 0);

  return (
    <div className="space-y-6">
      {/* Top SOC HUD Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-1 border-b border-cyan-500/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-400/30 text-cyan-400 shadow-md shadow-cyan-950">
              <Crosshair className="w-5 h-5 animate-spin-slow" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black font-mono tracking-wider text-white uppercase flex items-center gap-2">
                <span>SOC THREAT COMMAND CENTER</span>
                <span className="text-[10px] tracking-widest text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  AUTONOMOUS DECEPTION ACTIVE
                </span>
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Primary Honeypot Cluster: <span className="text-amber-300 font-bold">AWS US-EAST-1</span> • Real-time Adversary Trajectories & Attack Surface
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-mono text-slate-400 cursor-pointer select-none bg-[#070e22] px-3 py-1.5 rounded-lg border border-cyan-500/20">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3.5 h-3.5 text-cyan-500 border-slate-700 rounded bg-slate-900 focus:ring-cyan-400"
            />
            <span>AUTO-SYNC (30s)</span>
          </label>

          <button
            onClick={loadData}
            disabled={isRefreshing || statsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#070e22] border border-cyan-500/30 text-cyan-300 hover:text-white hover:border-cyan-400 text-xs font-mono font-bold transition-all disabled:opacity-50"
            title="Force telemetry sync"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', (isRefreshing || statsLoading) && 'animate-spin')} />
            <span>SYNC</span>
          </button>
        </div>
      </div>

      {/* Backend API Disconnected Alert */}
      {(!isApiHealthy || statsError) && (
        <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-center gap-3 text-rose-300 text-xs font-mono">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <div>
            <p className="font-bold uppercase tracking-wider">TELEMETRY STREAM DISCONNECTED</p>
            <p className="text-slate-400 mt-0.5">Unable to establish handshake with CloudDecept API service. Displaying cached telemetry state.</p>
          </div>
        </div>
      )}

      {/* Central HUD Metrics Layer (Cinematic Cyber Pill Dock) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Active Sessions */}
        <div className="glass-panel p-4 rounded-xl relative overflow-hidden border border-emerald-500/30">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1">
            <span>ACTIVE SESSIONS</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight glow-emerald">
            {activeSessions}
          </div>
          <p className="text-[10px] font-mono text-slate-400 mt-1 flex items-center gap-1">
            <span className="text-emerald-400 font-bold">LIVE</span> in-flight probes
          </p>
        </div>

        {/* Metric 2: Total Sessions */}
        <div className="glass-panel p-4 rounded-xl relative overflow-hidden border border-cyan-500/25">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1">
            <span>TOTAL SESSIONS</span>
            <Users className="w-3.5 h-3.5 text-cyan-400/80" />
          </div>
          <div className="text-2xl font-black font-mono text-white tracking-tight glow-cyan">
            {totalSessions.toLocaleString()}
          </div>
          <p className="text-[10px] font-mono text-slate-400 mt-1">
            All-time ClickHouse records
          </p>
        </div>

        {/* Metric 3: Total Commands */}
        <div className="glass-panel p-4 rounded-xl relative overflow-hidden border border-cyan-500/25">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1">
            <span>TOTAL COMMANDS</span>
            <Terminal className="w-3.5 h-3.5 text-cyan-400/80" />
          </div>
          <div className="text-2xl font-black font-mono text-white tracking-tight">
            {totalCommands.toLocaleString()}
          </div>
          <p className="text-[10px] font-mono text-slate-400 mt-1">
            Deduplicated executions
          </p>
        </div>

        {/* Metric 4: Unique Attackers */}
        <div className="glass-panel p-4 rounded-xl relative overflow-hidden border border-purple-500/30">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1">
            <span>UNIQUE ATTACKERS</span>
            <Globe className="w-3.5 h-3.5 text-purple-400/80" />
          </div>
          <div className="text-2xl font-black font-mono text-purple-300 tracking-tight">
            {uniqueAttackers.toLocaleString()}
          </div>
          <p className="text-[10px] font-mono text-slate-400 mt-1">
            Distinct adversarial IPs
          </p>
        </div>

        {/* Metric 5: Commands 24h */}
        <div className="glass-panel p-4 rounded-xl relative overflow-hidden border border-teal-500/30">
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1">
            <span>COMMANDS (24H)</span>
            <Clock className="w-3.5 h-3.5 text-teal-400/80" />
          </div>
          <div className="text-2xl font-black font-mono text-teal-300 tracking-tight">
            {recentCommands24h.toLocaleString()}
          </div>
          <p className="text-[10px] font-mono text-slate-400 mt-1">
            Last 24 hours activity
          </p>
        </div>

        {/* Metric 6: High-Risk Threats */}
        <div className="glass-panel p-4 rounded-xl relative overflow-hidden border border-rose-500/30">
          <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-1">
            <span>HIGH-RISK THREATS</span>
            <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-400 tracking-tight glow-rose">
            {highRiskCount.toLocaleString()}
          </div>
          <p className="text-[10px] font-mono text-slate-400 mt-1">
            Severity level ≥ 5 (High/Crit)
          </p>
        </div>
      </div>

      {/* Centerpiece: Real-World Geographic Attack Map */}
      <div className="w-full">
        <GeographicMap
          data={topCountries}
          totalSessions={totalSessions}
          isLoading={statsLoading}
        />
      </div>

      {/* Operational Intelligence Triad */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Live Attack Activity Stream */}
        <div className="glass-panel rounded-2xl flex flex-col border border-cyan-500/20">
          <div className="p-4 border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <Radio className="w-4 h-4 animate-pulse" />
              </span>
              <div>
                <h2 className="text-xs font-bold font-mono tracking-wider text-white uppercase">
                  LIVE ATTACK ACTIVITY
                </h2>
                <p className="text-[10px] text-slate-400 font-mono">Real-time honeypot sensor stream</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30">
              STREAMING
            </span>
          </div>

          <div className="p-3.5 flex-1 max-h-[380px] overflow-y-auto scrollbar-thin space-y-2">
            {realTimeEventsArray.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                <Activity className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="text-slate-400">Awaiting live event triggers...</p>
                <p className="text-[10px] text-slate-500 mt-1">Connect to SSH port 2222 to generate live stream</p>
              </div>
            ) : (
              realTimeEventsArray.slice(0, 20).map((event, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-[#070e22]/90 border border-cyan-500/15 hover:border-cyan-400/40 transition-all font-mono text-xs flex items-start gap-2.5"
                >
                  <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1 flex-shrink-0 animate-ping" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-cyan-300 uppercase tracking-wider">
                        {event.type?.replace(/_/g, ' ') || 'Attack Vector'}
                      </span>
                      <span className="text-slate-500">
                        {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'Just now'}
                      </span>
                    </div>
                    <pre className="text-[11px] text-slate-300 mt-1 overflow-x-auto p-1.5 rounded bg-black/40 border border-slate-800">
                      {typeof event.data === 'string'
                        ? event.data
                        : JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Attacker Intelligence & High Risk Sessions */}
        <div className="glass-panel rounded-2xl flex flex-col border border-cyan-500/20">
          <div className="p-4 border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Crosshair className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-xs font-bold font-mono tracking-wider text-white uppercase">
                  ATTACKER PROFILES
                </h2>
                <p className="text-[10px] text-slate-400 font-mono">Most active adversary sessions</p>
              </div>
            </div>
            <Link
              href="/sessions"
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold"
            >
              INVESTIGATE →
            </Link>
          </div>

          <div className="p-3.5 flex-1 max-h-[380px] overflow-y-auto scrollbar-thin space-y-2.5">
            {topAttackerSessions.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                <Users className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p>No active attacker profiles available</p>
              </div>
            ) : (
              topAttackerSessions.map((session) => {
                const ip = session.src_ip || session.attacker_ip || 'unknown';
                const country = getCountryName(session.src_country || session.country);
                const threat = evaluateThreat(session.threat_score ?? session.skill_level);

                return (
                  <div
                    key={session.session_id}
                    className="p-2.5 rounded-lg bg-[#070e22]/90 border border-cyan-500/15 hover:border-cyan-400/40 transition-all font-mono text-xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/sessions/${session.session_id}`}
                          className="font-bold text-white hover:text-cyan-400 transition-colors truncate text-xs"
                        >
                          {ip}
                        </Link>
                        <button
                          onClick={() => handleCopy(ip, `ip-${session.session_id}`)}
                          className="text-slate-500 hover:text-cyan-300 p-0.5"
                          title="Copy IP"
                        >
                          {copiedKey === `ip-${session.session_id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-cyan-400" />
                        <span className="truncate">{country}</span>
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0 flex items-center gap-2.5">
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {(session.command_count ?? 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] text-slate-500 uppercase">cmds</span>
                      </div>
                      <span
                        className={cn(
                          'badge text-[10px] font-bold px-2 py-0.5',
                          threat.badgeClass
                        )}
                        title={threat.description}
                      >
                        {threat.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: MITRE Intent Taxonomy & Adaptive Policies */}
        <div className="glass-panel rounded-2xl flex flex-col border border-cyan-500/20">
          <div className="p-4 border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Shield className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-xs font-bold font-mono tracking-wider text-white uppercase">
                  MITRE ATT&CK INTENTS
                </h2>
                <p className="text-[10px] text-slate-400 font-mono">Classified objective taxonomy</p>
              </div>
            </div>
            <Link
              href="/threat-intel"
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold"
            >
              MATRIX →
            </Link>
          </div>

          <div className="p-3.5 flex-1 max-h-[380px] overflow-y-auto scrollbar-thin space-y-3 font-mono">
            {topIntents.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                <Shield className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p>No classified intent vectors</p>
              </div>
            ) : (
              topIntents.slice(0, 6).map((item, idx) => {
                const norm = normalizeIntent(item.intent);
                const maxVal = topIntents[0]?.count || 1;
                const pct = Math.min(100, Math.round((item.count / maxVal) * 100));

                return (
                  <div key={item.intent} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 flex items-center gap-1.5 truncate">
                        <span className="text-cyan-500/70 font-bold">{idx + 1}.</span>
                        <span className="font-semibold">{norm.label}</span>
                      </span>
                      <span className="text-cyan-400 font-bold">
                        {item.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}

            {/* Micro Adaptive Response HUD */}
            <div className="mt-4 pt-3 border-t border-cyan-500/15">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="font-bold text-white flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  ADAPTIVE DEFENSE
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">ENGAGED</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Canary AWS credentials, latency throttling, and decoy storage targets are dynamically injected upon reconnaissance intent detection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}