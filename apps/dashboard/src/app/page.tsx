'use client';

import { cn, formatTimestamp, getIntentColor, getSeverityColor } from '@/lib/utils';
import { StatCard } from '@/components/StatCard';
import { useDashboardStore } from '@/lib/store';
import { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Users,
  Terminal,
  MapPin,
  Clock,
  Shield,
  TrendingUp,
  Database,
  Wifi,
  WifiOff,
  Server,
  BarChart2,
  PieChart,
  Target,
  Zap,
  Globe,
  Terminal as TerminalIcon,
  MapPin as MapPinIcon,
  Key,
  Sparkles,
  Zap as ZapIcon,
  Shield as ShieldIcon,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

export default function OverviewPage() {
  const {
    stats,
    fetchStats,
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

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchStats(87600), // all-time totals
        fetchSessions({ limit: 500, hours: 8760 }),
        fetchTopCommands(24, 20),
        fetchConnectionStatus(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial load & real-time events
  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToEvents();
    return unsubscribe;
  }, [fetchStats, fetchSessions, fetchTopCommands, fetchConnectionStatus, subscribeToEvents]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats(87600);
      fetchTopCommands(24, 20);
      fetchConnectionStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats, fetchTopCommands, fetchConnectionStatus]);

  const sessionsArray = sessions ?? [];
  const realTimeEventsArray = realTimeEvents ?? [];
  const topCommandsArray = topCommands ?? [];

  // Authoritative backend stats
  const totalSessions = stats?.total_sessions ?? 0;
  const activeSessions = stats?.active_sessions ?? 0;
  const totalCommands = stats?.total_commands ?? 0;
  const uniqueAttackers = stats?.unique_attackers ?? 0;
  const recentCommandsCount = stats?.recent_commands ?? 0;
  const totalAuthAttempts = sessionsArray.reduce((acc, s) => acc + (s.credentials_tried ?? 0), 0);

  // Connection status
  const isApiHealthy = connectionStatus?.connected ?? false;

  // Intent distribution
  const intentCounts = useMemo(() => {
    return sessionsArray.flatMap(s => s.intent_history ?? []).reduce((acc, intent) => {
      acc[intent] = (acc[intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [sessionsArray]);

  // Country data
  const countryCounts = useMemo(() => {
    return sessionsArray.reduce((acc, s) => {
      const country = s.src_country || s.country || 'Unknown';
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [sessionsArray]);

  const highThreatSessions = sessionsArray.filter(s => (s.threat_score ?? 0) >= 70);

  return (
    <main className="p-6 space-y-6">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deception Overview</h1>
          <p className="text-gray-500 mt-1">Real-time honeypot telemetry and active threat surface</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium',
            isApiHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          )}>
            {isApiHealthy ? '● SYSTEM ONLINE' : '○ SYSTEM OFFLINE'}
          </span>
          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            aria-label="Refresh dashboard data"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Alert banner if API unhealthy */}
      {!isApiHealthy && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-yellow-800">Backend API disconnected</p>
            <p className="text-sm text-yellow-700">Showing cached data. Some features may be limited.</p>
          </div>
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Active Sessions"
          value={activeSessions}
          icon={<ShieldIcon className="w-6 h-6" />}
          iconBg="bg-red-100"
          iconColor="text-red-600"
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
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          trend="up"
        />
        <StatCard
          title="Unique Attackers"
          value={uniqueAttackers.toLocaleString()}
          icon={<Users className="w-6 h-6" />}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          trend="up"
        />
        <StatCard
          title="Commands (24h)"
          value={recentCommandsCount.toLocaleString()}
          icon={<Terminal className="w-6 h-6" />}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          title="Auth Attempts"
          value={totalAuthAttempts.toLocaleString()}
          icon={<Key className="w-6 h-6" />}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT PANEL - Live Attack Activity & Attacker Intelligence */}
        <div className="lg:col-span-2 space-y-6">
          {/* Live Attack Activity */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Activity className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">LIVE ATTACK ACTIVITY</h2>
                  <p className="text-xs text-gray-500">Real-time event stream from honeypot</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600">Auto-refresh (30s)</span>
                </label>
                <span className="text-xs text-green-600 font-semibold px-2 py-0.5 bg-green-50 rounded">LIVE</span>
              </div>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto scrollbar-thin">
              {realTimeEventsArray.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Activity className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500">Waiting for live events...</p>
                  <p className="text-xs text-gray-400 mt-1">Connect to Cowrie SSH (port 2222) to generate activity</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {realTimeEventsArray.slice(0, 30).map((event, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                        <Activity className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-900 capitalize">
                            {event.type?.replace(/_/g, ' ') || 'event'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(event.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <pre className="text-xs text-gray-600 mt-1 overflow-x-auto max-h-20 text-wrap">
                          {JSON.stringify(event.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attacker Intelligence & Intent Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attacker Intelligence */}
            <div className="card">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">ATTACKER INTELLIGENCE</h2>
                <span className="text-xs text-gray-500">{sessionsArray.length} sessions</span>
              </div>
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {sessionsArray.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No attacker data available</p>
                    <p className="text-xs text-gray-400 mt-1">Connect to SSH honeypot (port 2222) to generate data</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessionsArray
                      .filter(s => s.src_ip || s.attacker_ip)
                      .sort((a, b) => (b.command_count || 0) - (a.command_count || 0))
                      .slice(0, 8)
                      .map((session) => (
                        <Link
                          key={session.session_id}
                          href={`/sessions/${session.session_id}`}
                          className="block p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                <MapPin className="w-5 h-5 text-gray-500" />
                              </div>
                              <div>
                                <p className="font-mono text-sm font-medium text-gray-900">
                                  {session.src_ip ?? session.attacker_ip ?? 'unknown'}
                                </p>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                  <MapPinIcon className="w-3 h-3" />
                                  <span>{session.src_country || session.country || 'Unknown'}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-sm font-medium text-gray-900">
                                  {(session.command_count ?? 0).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500">commands</p>
                              </div>
                              <div className="text-right">
                                <span className={cn(
                                  'badge text-xs',
                                  (session.threat_score ?? 0) >= 70 ? 'bg-red-100 text-red-800' :
                                  (session.threat_score ?? 0) >= 40 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                )}>
                                  {(session.threat_score ?? 0)}/100
                                </span>
                                <p className="text-xs text-gray-500 mt-1">
                                  {formatTimestamp(session.start_time)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Intent Analysis */}
            <div className="card">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">INTENT ANALYSIS</h2>
                <span className="text-xs text-gray-500">MITRE ATT&CK Mapping</span>
              </div>
              <div className="p-4">
                {Object.keys(intentCounts).length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Target className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-500">No intent data available</p>
                    <p className="text-xs text-gray-400 mt-1">Intent classification requires session activity</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(intentCounts)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 8)
                      .map(([intent, count], index) => (
                        <div key={intent} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                            <span className={cn('badge text-xs', getIntentColor(intent))}>
                              {intent.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary-600 rounded-full transition-all"
                                style={{
                                  width: `${(intentCounts[intent] / (Math.max(...Object.values(intentCounts)) || 1)) * 100}%`
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-900 w-12 text-right">
                              {count}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Geographic Distribution */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">GEOGRAPHIC DISTRIBUTION</h2>
              <span className="text-xs text-gray-500">Top attacker countries</span>
            </div>
            <div className="p-4 space-y-3">
              {Object.entries(countryCounts).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Globe className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-500">No geographic data available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(countryCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([country, count], index) => (
                      <div key={country} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                          <span className="text-sm font-medium text-gray-900">{country}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-600 rounded-full transition-all"
                              style={{ width: `${(countryCounts[country] / Math.max(...Object.values(countryCounts))) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-900 w-12 text-right">
                            {count.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Top Commands & High Risk Sessions */}
        <div className="space-y-6">
          {/* Top Executed Commands */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-gray-600" />
                TOP EXECUTED COMMANDS
              </h2>
              <button
                onClick={() => fetchTopCommands(24, 20)}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto bg-gray-900 rounded-b-lg font-mono text-green-300 text-sm">
              {topCommandsArray.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Terminal className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                  <p>No commands captured yet</p>
                  <p className="text-xs mt-1">SSH to port 2222 to generate activity</p>
                </div>
              ) : (
                <div className="space-y-2 font-mono">
                  {topCommandsArray.slice(0, 15).map((cmd, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 text-xs border-b border-gray-800 pb-1.5">
                      <span className="text-green-400 font-mono truncate max-w-[200px]" title={cmd.command}>
                        {cmd.command}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-gray-400 text-xs">{cmd.executions}x</span>
                        <span className="text-gray-500 text-[10px]">({cmd.unique_sessions} sess)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* High-Risk Sessions */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">HIGH-RISK SESSIONS</h2>
              <Link href="/sessions" className="text-xs text-primary-600 hover:text-primary-700">
                View all
              </Link>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {highThreatSessions.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">No high-risk sessions detected</p>
              ) : (
                highThreatSessions.slice(0, 6).map((session) => (
                  <Link
                    key={session.session_id}
                    href={`/sessions/${session.session_id}`}
                    className="block p-3 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-xs text-gray-900">{session.session_id.slice(0, 12)}...</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {session.src_ip || session.attacker_ip || 'unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge font-mono bg-red-100 text-red-800">
                          {(session.threat_score ?? 0)}/100
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Adaptive Engine Card */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Adaptive Response Engine</h3>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">Adaptive Engine Active</p>
                  <p className="text-xs text-blue-700">Automated deception responses enabled</p>
                </div>
                <span className="badge bg-blue-100 text-blue-800 ml-auto">ONLINE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}