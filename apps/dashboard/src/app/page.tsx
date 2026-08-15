'use client';

import { cn, formatTimestamp, getSeverityColor, getIntentColor } from '@/lib/utils';
import { StatCard } from '@/components/StatCard';
import { useDashboardStore } from '@/lib/store';
import { useEffect } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';

export default function OverviewPage() {
  const {
    stats,
    fetchStats,
    fetchAllTimeStats,
    sessions,
    fetchSessions,
    connectionStatus,
    fetchConnectionStatus,
    subscribeToEvents,
    realTimeEvents,
  } = useDashboardStore();

  useEffect(() => {
    // Fetch all-time stats for accurate totals
    fetchAllTimeStats();
    // Fetch sessions with large hours window to get historical sessions
    fetchSessions({ limit: 10, hours: 8760 }); // ~1 year
    fetchConnectionStatus();
    const unsubscribe = subscribeToEvents();
    return unsubscribe;
  }, [fetchStats, fetchAllTimeStats, fetchSessions, fetchConnectionStatus, subscribeToEvents]);

  const sessionsArray = sessions ?? [];
  const realTimeEventsArray = realTimeEvents ?? [];

  // DEBUG: Log stats received by Overview page
  console.log('[CloudDecept] Overview page stats:', stats);

  // Use authoritative backend stats - all-time totals
  const totalSessions = stats?.total_sessions ?? 0;
  const activeSessions = stats?.active_sessions ?? 0;
  const totalCommands = stats?.total_commands ?? 0;
  const uniqueAttackers = stats?.unique_attackers ?? 0;
  const recentSessionsCount = stats?.recent_sessions ?? 0;

  const recentSessions = sessionsArray.slice(0, 5);
  const topIntents = stats?.top_intents ?? [];
  const topCountries = stats?.top_countries ?? [];
  const threatDistribution = stats?.threat_distribution ?? [];

  // Connection status - use detailed status
  const isApiHealthy = connectionStatus?.connected ?? false;
  const clickhouseStatus = connectionStatus?.clickhouse ?? 'unknown';
  const postgresStatus = connectionStatus?.postgres ?? 'unknown';
  const redisStatus = connectionStatus?.redis ?? 'unknown';

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-500 mt-1">Real-time monitoring of adaptive cloud honeypot activity</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status with detailed breakdown */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-2 py-1 rounded-full text-xs font-medium',
                isApiHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              )}
            >
              {isApiHealthy ? '● API Connected' : '○ API Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Connection health indicators */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">System Health</h2>
          <button
            onClick={() => fetchConnectionStatus()}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            <Server className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">
          <div className={cn('p-3 rounded-lg flex items-center gap-3', isApiHealthy ? 'bg-green-50' : 'bg-red-50')}>
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', isApiHealthy ? 'bg-green-100' : 'bg-red-100')}>
              <Server className={cn('w-4 h-4', isApiHealthy ? 'text-green-600' : 'text-red-600')} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">API Gateway</p>
              <p className="text-xs text-gray-500">{isApiHealthy ? 'Healthy' : 'Offline'}</p>
            </div>
          </div>
          <div className={cn('p-3 rounded-lg flex items-center gap-3', clickhouseStatus === 'healthy' ? 'bg-green-50' : 'bg-red-50')}>
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', clickhouseStatus === 'healthy' ? 'bg-green-100' : 'bg-red-100')}>
              <Database className={cn('w-4 h-4', clickhouseStatus === 'healthy' ? 'text-green-600' : 'text-red-600')} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">ClickHouse</p>
              <p className="text-xs text-gray-500 capitalize">{clickhouseStatus}</p>
            </div>
          </div>
          <div className={cn('p-3 rounded-lg flex items-center gap-3', postgresStatus === 'healthy' ? 'bg-green-50' : 'bg-red-50')}>
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', postgresStatus === 'healthy' ? 'bg-green-100' : 'bg-red-100')}>
              <Database className={cn('w-4 h-4', postgresStatus === 'healthy' ? 'text-green-600' : 'text-red-600')} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">PostgreSQL</p>
              <p className="text-xs text-gray-500 capitalize">{postgresStatus}</p>
            </div>
          </div>
          <div className={cn('p-3 rounded-lg flex items-center gap-3', redisStatus === 'healthy' ? 'bg-green-50' : 'bg-red-50')}>
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', redisStatus === 'healthy' ? 'bg-green-100' : 'bg-red-100')}>
              {redisStatus === 'healthy' ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-red-600" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Redis</p>
              <p className="text-xs text-gray-500 capitalize">{redisStatus}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Sessions (All-Time)"
          value={totalSessions.toLocaleString()}
          change={recentSessionsCount > 0 ? Math.round((recentSessionsCount / Math.max(totalSessions, 1)) * 100) : 0}
          icon={<Activity className="w-6 h-6" />}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
          trend="up"
        />
        <StatCard
          title="Active Sessions"
          value={activeSessions.toLocaleString()}
          change={totalSessions > 0 ? Math.round((activeSessions / totalSessions) * 100) : 0}
          icon={<Shield className="w-6 h-6" />}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          trend={activeSessions > 0 ? "up" : "neutral"}
        />
        <StatCard
          title="Total Commands (All-Time)"
          value={totalCommands.toLocaleString()}
          change={stats?.recent_commands && stats?.total_commands ? Math.round((stats.recent_commands / Math.max(stats.total_commands, 1)) * 100) : 0}
          icon={<Terminal className="w-6 h-6" />}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          trend="up"
        />
        <StatCard
          title="Unique Attackers (All-Time)"
          value={uniqueAttackers.toLocaleString()}
          change={stats?.recent_unique_attackers && stats?.unique_attackers ? Math.round((stats.recent_unique_attackers / Math.max(stats.unique_attackers, 1)) * 100) : 0}
          icon={<Users className="w-6 h-6" />}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          trend="up"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Sessions</h2>
            <Link href="/sessions" className="text-sm text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Attacker</th>
                  <th>Status</th>
                  <th>Commands</th>
                  <th>Threat Score</th>
                  <th>Duration</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No sessions yet. Waiting for connections...
                    </td>
                  </tr>
                ) : (
                  recentSessions.map((session) => (
                    <tr key={session.session_id} className="cursor-pointer hover:bg-gray-50">
                      <td className="font-mono text-xs">{session.session_id.slice(0, 12)}...</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <span>{session.src_ip ?? session.attacker_ip ?? 'unknown'}</span>
                          {session.src_country && (
                            <span className="text-xs text-gray-500">({session.src_country})</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={cn(
                            'badge',
                            session.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {session.status ?? 'unknown'}
                        </span>
                      </td>
                      <td>{session.command_count ?? 0}</td>
                      <td>
                        <span
                          className={cn(
                            'badge',
                            (session.threat_score ?? 0) >= 70 ? 'bg-red-100 text-red-800' :
                            (session.threat_score ?? 0) >= 40 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          )}
                        >
                          {(session.threat_score ?? 0)}/100
                        </span>
                      </td>
                      <td>
                        <Clock className="w-3 h-3 inline text-gray-400" />
                        {session.duration_seconds
                          ? `${Math.floor(session.duration_seconds / 60)}m`
                          : '—'}
                      </td>
                      <td className="text-sm text-gray-500">
                        {formatTimestamp(session.start_time)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Top Attack Intents (All-Time)</h2>
            <Link href="/threat-intel" className="text-sm text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </div>
          <div className="p-4 space-y-4">
            {topIntents.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No intent data available</p>
            ) : (
              topIntents.map((item, index) => (
                <div key={item.intent} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                    <span
                      className={cn(
                        'badge',
                        getIntentColor(item.intent)
                      )}
                    >
                      {item.intent.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-600 rounded-full transition-all"
                        style={{ width: `${(item.count / (topIntents[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Geographic Distribution (All-Time)</h2>
          </div>
          <div className="p-4 space-y-3">
            {topCountries.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No geographic data available</p>
            ) : (
              topCountries.map((country, index) => (
                <div key={country.country} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
                    <span className="text-sm font-medium text-gray-900">{country.country}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-40 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-warning-500 rounded-full transition-all"
                        style={{ width: `${(country.count / (topCountries[0]?.count || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {country.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Threat Level Distribution (All-Time)</h2>
          </div>
          <div className="p-4 space-y-3">
            {threatDistribution.length === 0 || threatDistribution.every(t => t.count === 0) ? (
              <p className="text-center text-gray-500 py-8">No threat data available</p>
            ) : (
              threatDistribution.map((item) => (
                <div key={item.level} className="flex items-center justify-between">
                  <span
                    className={cn('badge', getSeverityColor(item.level))}
                  >
                    {item.level}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(item.count / (threatDistribution.find(t => t.count > 0)?.count || 1)) * 100}%`,
                          backgroundColor: item.level === 'Critical' ? '#ef4444' :
                                           item.level === 'High' ? '#dc2626' :
                                           item.level === 'Medium' ? '#f59e0b' : '#22c55e'
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Live Event Stream</h2>
          <button
            onClick={() => useDashboardStore.getState().clearRealTimeEvents()}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto scrollbar-thin">
          {realTimeEventsArray.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {isApiHealthy ? 'Waiting for events...' : 'Connect to event stream to see live activity'}
            </p>
          ) : (
            <div className="space-y-2">
              {realTimeEvents.slice(0, 20).map((event, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-900 capitalize">{event.type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <pre className="text-xs text-gray-600 mt-1 overflow-x-auto max-h-20">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}