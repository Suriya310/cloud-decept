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
} from 'lucide-react';
import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { StatCard } from '@/components/StatCard';
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

  // Initial load and WebSocket / SSE subscription
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

  // System status
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
      .slice(0, 7);
  }, [sessionsArray]);

  // Total high-risk count from all-time threat distribution
  const highRiskCount = (threatDistribution.critical || 0) + (threatDistribution.high || 0);

  return (
    <main className="p-6 space-y-6">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deception Overview</h1>
          <p className="text-gray-500 mt-1">
            Authoritative honeypot telemetry, global attack surface, and real-time defense posture
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5',
              isApiHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            )}
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                isApiHealthy ? 'bg-green-600 animate-pulse' : 'bg-red-600'
              )}
            />
            {isApiHealthy ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}
          </span>
          <button
            onClick={loadData}
            disabled={isRefreshing || statsLoading}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
            aria-label="Refresh dashboard data"
            title="Refresh telemetry"
          >
            <RefreshCw className={cn('w-4 h-4', (isRefreshing || statsLoading) && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Backend API Disconnected Alert */}
      {(!isApiHealthy || statsError) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Backend API unreachable</p>
            <p className="text-sm text-amber-700">
              Unable to reach CloudDecept API service. Showing cached or local state.
            </p>
          </div>
        </div>
      )}

      {/* Key Metrics Row (Authoritative all-time + 24h metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Active Sessions"
          value={activeSessions}
          icon={<Shield className="w-6 h-6" />}
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
          trend="up"
        />
        <StatCard
          title="Total Sessions"
          value={totalSessions.toLocaleString()}
          icon={<Users className="w-6 h-6" />}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          trend="up"
        />
        <StatCard
          title="Total Commands"
          value={totalCommands.toLocaleString()}
          icon={<Terminal className="w-6 h-6" />}
          iconBg="bg-indigo-100"
          iconColor="text-indigo-600"
          trend="up"
        />
        <StatCard
          title="Unique Attackers"
          value={uniqueAttackers.toLocaleString()}
          icon={<Globe className="w-6 h-6" />}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          trend="up"
        />
        <StatCard
          title="Commands (24h)"
          value={recentCommands24h.toLocaleString()}
          icon={<Clock className="w-6 h-6" />}
          iconBg="bg-teal-100"
          iconColor="text-teal-600"
        />
        <StatCard
          title="High-Risk Threats"
          value={highRiskCount.toLocaleString()}
          icon={<Flame className="w-6 h-6" />}
          iconBg="bg-rose-100"
          iconColor="text-rose-600"
        />
      </div>

      {/* Interactive Geographic Attack Map */}
      <div className="w-full">
        <GeographicMap
          data={topCountries}
          totalSessions={totalSessions}
          isLoading={statsLoading}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT TWO COLUMNS */}
        <div className="lg:col-span-2 space-y-6">
          {/* Attacker Intelligence & Intent Analysis Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Attacker Intelligence */}
            <div className="card flex flex-col">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">ATTACKER INTELLIGENCE</h2>
                  <p className="text-xs text-gray-500">Most active sessions by captured activity</p>
                </div>
                <Link
                  href="/sessions"
                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
                >
                  View all
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <div className="p-4 flex-1">
                {topAttackerSessions.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Users className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm">No session data available</p>
                    <p className="text-xs text-gray-400 mt-1">Connect to SSH honeypot to generate telemetry</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topAttackerSessions.map((session) => {
                      const ip = session.src_ip || session.attacker_ip || 'unknown';
                      const countryName = getCountryName(session.src_country || session.country);
                      const threat = evaluateThreat(session.threat_score ?? session.skill_level);

                      return (
                        <div
                          key={session.session_id}
                          className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/sessions/${session.session_id}`}
                                className="font-mono text-sm font-semibold text-gray-900 hover:text-primary-600 transition-colors truncate"
                              >
                                {ip}
                              </Link>
                              <button
                                onClick={() => handleCopy(ip, `ip-${session.session_id}`)}
                                className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors"
                                title="Copy IP address"
                                aria-label="Copy IP address"
                              >
                                {copiedKey === `ip-${session.session_id}` ? (
                                  <Check className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              <span className="truncate">{countryName}</span>
                            </p>
                          </div>

                          <div className="text-right flex-shrink-0 flex items-center gap-3">
                            <div>
                              <p className="text-sm font-bold text-gray-900">
                                {(session.command_count ?? 0).toLocaleString()}
                              </p>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">cmds</p>
                            </div>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-xs font-semibold',
                                threat.badgeBg,
                                threat.badgeColor
                              )}
                              title={threat.description}
                            >
                              {threat.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* MITRE Intent Analysis (All-Time Authoritative) */}
            <div className="card flex flex-col">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">INTENT ANALYSIS</h2>
                  <p className="text-xs text-gray-500">MITRE ATT&CK objective classification (All-Time)</p>
                </div>
                <span className="text-xs font-medium text-gray-500">
                  {topIntents.reduce((acc, i) => acc + i.count, 0).toLocaleString()} events
                </span>
              </div>
              <div className="p-4 flex-1">
                {topIntents.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Activity className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm">No classified intents available</p>
                    <p className="text-xs text-gray-400 mt-1">Intent engine classifies captured commands</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topIntents.slice(0, 7).map((item, idx) => {
                      const maxCount = topIntents[0]?.count || 1;
                      const percentage = Math.min(100, Math.round((item.count / maxCount) * 100));
                      const normalized = normalizeIntent(item.intent);

                      return (
                        <div key={item.intent} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-gray-800 flex items-center gap-1.5">
                              <span className="text-gray-400 font-mono">{idx + 1}.</span>
                              {normalized.label}
                            </span>
                            <span className="font-semibold text-gray-900 font-mono">
                              {item.count.toLocaleString()}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-600 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live Honeypot Attack Activity */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Activity className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">LIVE ATTACK ACTIVITY</h2>
                  <p className="text-xs text-gray-500">Real-time event stream from deception network</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span>Auto-refresh (30s)</span>
                </label>
              </div>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto scrollbar-thin">
              {realTimeEventsArray.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Activity className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm font-medium text-gray-600">Waiting for live attack events...</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Connect to Cowrie SSH (port 2222) to observe live command captures
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {realTimeEventsArray.slice(0, 20).map((event, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                        <Activity className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-900 capitalize">
                            {event.type?.replace(/_/g, ' ') || 'Attack Event'}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'Just now'}
                          </span>
                        </div>
                        <pre className="text-xs font-mono text-gray-700 mt-1 overflow-x-auto p-2 bg-white rounded border border-gray-200">
                          {typeof event.data === 'string'
                            ? event.data
                            : JSON.stringify(event.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Top Executed Commands */}
          <div className="card flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-gray-600" />
                TOP EXECUTED COMMANDS
              </h2>
              <Link
                href="/commands"
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
              >
                View all
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-4 bg-gray-950 rounded-b-lg font-mono text-xs flex-1 max-h-96 overflow-y-auto">
              {topCommandsArray.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Terminal className="w-10 h-10 mx-auto text-gray-600 mb-2" />
                  <p>No commands captured yet</p>
                  <p className="text-[11px] text-gray-500 mt-1">Interact with honeypot to record commands</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topCommandsArray.slice(0, 15).map((cmd, index) => {
                    const cmdKey = `cmd-${index}`;
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-2 border-b border-gray-800/60 pb-2 group"
                      >
                        <span
                          className="text-emerald-400 truncate max-w-[180px]"
                          title={cmd.command}
                        >
                          {cmd.command}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-gray-400 text-[11px]">
                            {cmd.executions.toLocaleString()}x
                          </span>
                          <button
                            onClick={() => handleCopy(cmd.command, cmdKey)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white transition-opacity p-0.5"
                            title="Copy command"
                            aria-label="Copy command"
                          >
                            {copiedKey === cmdKey ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* High-Risk Detected Sessions */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-600" />
                  HIGH-RISK SESSIONS
                </h2>
                <p className="text-xs text-gray-500">Skill level ≥ 5 or Critical severity</p>
              </div>
              <Link
                href="/sessions"
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
              >
                View all
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div className="p-4 space-y-3">
              {highRiskSessions.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <Shield className="w-8 h-8 mx-auto text-gray-300 mb-1" />
                  <p className="text-xs">No active high-risk sessions detected</p>
                </div>
              ) : (
                highRiskSessions.map(({ session, threat }) => (
                  <Link
                    key={session.session_id}
                    href={`/sessions/${session.session_id}`}
                    className="block p-3 bg-rose-50/70 border border-rose-200 rounded-lg hover:bg-rose-100/70 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-gray-900 truncate">
                          {session.session_id.slice(0, 16)}...
                        </p>
                        <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-rose-500" />
                          <span>{session.src_ip || session.attacker_ip || 'unknown'}</span>
                          <span>•</span>
                          <span>{getCountryName(session.src_country || session.country)}</span>
                        </p>
                      </div>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-bold flex-shrink-0',
                          threat.badgeBg,
                          threat.badgeColor
                        )}
                      >
                        {threat.label}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Adaptive Response Policy Status */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Adaptive Defense Status</h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                POLICY ACTIVE
              </span>
            </div>
            <p className="text-xs text-gray-600">
              Autonomous canary credential injection, latency throttling, and honeypot deception strategies are continuously enforced.
            </p>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>Strategy Engine</span>
              <Link href="/adaptations" className="text-primary-600 hover:underline font-medium">
                View Policy Rules →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}