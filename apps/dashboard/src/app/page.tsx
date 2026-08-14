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
} from 'lucide-react';
import Link from 'next/link';

export default function OverviewPage() {
  const {
    stats,
    fetchStats,
    sessions,
    fetchSessions,
    isConnected,
    subscribeToEvents,
    realTimeEvents,
  } = useDashboardStore();

  useEffect(() => {
    fetchStats();
    fetchSessions({ limit: 10 });
    const unsubscribe = subscribeToEvents();
    return unsubscribe;
  }, [fetchStats, fetchSessions, subscribeToEvents]);

  const sessionsArray = sessions ?? [];
  const realTimeEventsArray = realTimeEvents ?? [];

  const activeSessions = sessionsArray.filter((s) => s.status === 'active').length;
  const totalCommands = stats?.total_commands || 0;
  const uniqueAttackers = stats?.unique_attackers || 0;
  const avgThreatScore =
    sessionsArray.length > 0
      ? Math.round(sessionsArray.reduce((acc, s) => acc + (s.threat_score || 0), 0) / sessionsArray.length)
      : 0;

  const recentSessions = sessionsArray.slice(0, 5);
  const topIntents = stats?.top_intents ?? [];
  const topCountries = stats?.top_countries ?? [];
  const threatDistribution = stats?.threat_distribution ?? [];

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-500 mt-1">Real-time monitoring of adaptive cloud honeypot activity</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-2 py-1 rounded-full text-xs font-medium',
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            )}
          >
            {isConnected ? '● Live' : '○ Offline'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Sessions"
          value={activeSessions}
          change={stats ? Math.round((activeSessions / Math.max(stats.total_sessions, 1)) * 100) : 0}
          icon={<Activity className="w-6 h-6" />}
          iconBg="bg-primary-100"
          iconColor="text-primary-600"
          trend="up"
        />
        <StatCard
          title="Total Commands"
          value={totalCommands.toLocaleString()}
          change={12}
          icon={<Terminal className="w-6 h-6" />}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          trend="up"
        />
        <StatCard
          title="Unique Attackers"
          value={uniqueAttackers}
          change={-5}
          icon={<Users className="w-6 h-6" />}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          trend="down"
        />
        <StatCard
          title="Avg Threat Score"
          value={avgThreatScore}
          change={8}
          icon={<AlertTriangle className="w-6 h-6" />}
          iconBg="bg-red-100"
          iconColor="text-red-600"
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
                          <span>{session.src_ip}</span>
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
                          {session.status}
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
            <h2 className="text-lg font-semibold text-gray-900">Top Attack Intents</h2>
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
                      {item.count}
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
            <h2 className="text-lg font-semibold text-gray-900">Geographic Distribution</h2>
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
                      {country.count}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Threat Level Distribution</h2>
          </div>
          <div className="p-4 space-y-3">
            {threatDistribution.length === 0 ? (
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
                          width: `${(item.count / (threatDistribution[0]?.count || 1)) * 100}%`,
                          backgroundColor: item.level === 'critical' ? '#ef4444' :
                                           item.level === 'high' ? '#dc2626' :
                                           item.level === 'medium' ? '#f59e0b' : '#22c55e'
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">
                      {item.count}
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
              {isConnected ? 'Waiting for events...' : 'Connect to event stream to see live activity'}
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