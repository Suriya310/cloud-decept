'use client';

import { cn, formatTimestamp, getSeverityColor, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  AlertTriangle,
  Shield,
  Download,
  Eye,
  MapPin,
  Clock,
  Terminal,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

export default function ThreatIntelPage() {
  const { sessions, fetchSessions, stats, connectionStatus, fetchConnectionStatus } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [viewMode, setViewMode] = useState<'overview' | 'iocs' | 'techniques'>('overview');

  useEffect(() => {
    fetchSessions({ limit: 200 });
    fetchConnectionStatus();
  }, [fetchSessions, fetchConnectionStatus]);

  const sessionsArray = sessions ?? [];

  const allTechniques = sessionsArray.flatMap((s) =>
    (s.intent_history ?? []).map((intent, idx) => ({
      session_id: s.session_id,
      src_ip: s.src_ip,
      intent,
      timestamp: s.start_time,
      threat_score: s.threat_score,
    }))
  );

  const threatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) > 0);
  const highThreatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) >= 70);
  const mediumThreatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) >= 40 && (s.threat_score ?? 0) < 70);
  const lowThreatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) > 0 && (s.threat_score ?? 0) < 40);

  const intentCounts = sessionsArray.flatMap((s) => s.intent_history ?? []).reduce((acc, intent) => {
    acc[intent] = (acc[intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Connection status
  const isApiHealthy = connectionStatus?.connected ?? false;
  const apiStatus = connectionStatus?.status ?? 'unknown';
  const clickhouseStatus = connectionStatus?.clickhouse ?? 'unknown';
  const postgresStatus = connectionStatus?.postgres ?? 'unknown';
  const redisStatus = connectionStatus?.redis ?? 'unknown';

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Threat Intelligence</h1>
            <p className="text-gray-500 mt-1">MITRE ATT&CK mapping, IOC extraction, and session analysis</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search threats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Connection status bar */}
        <div className="card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className={cn('flex items-center gap-1.5', isApiHealthy ? 'text-green-600' : 'text-red-600')}>
                <span className={cn('w-2 h-2 rounded-full', isApiHealthy ? 'bg-green-500' : 'bg-red-500')} />
                API: {apiStatus}
              </span>
              <span className={cn('flex items-center gap-1.5', clickhouseStatus === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                <span className={cn('w-2 h-2 rounded-full', clickhouseStatus === 'healthy' ? 'bg-green-500' : 'bg-red-500')} />
                CH: {clickhouseStatus}
              </span>
              <span className={cn('flex items-center gap-1.5', postgresStatus === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                <span className={cn('w-2 h-2 rounded-full', postgresStatus === 'healthy' ? 'bg-green-500' : 'bg-red-500')} />
                PG: {postgresStatus}
              </span>
              <span className={cn('flex items-center gap-1.5', redisStatus === 'healthy' ? 'text-green-600' : 'text-red-600')}>
                <span className={cn('w-2 h-2 rounded-full', redisStatus === 'healthy' ? 'bg-green-500' : 'bg-red-500')} />
                RD: {redisStatus}
              </span>
            </div>
            <button
              onClick={() => fetchConnectionStatus()}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Critical Threats</p>
                <p className="text-3xl font-bold text-red-600">{highThreatSessions.length}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="card p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">High Threats</p>
                <p className="text-3xl font-bold text-orange-600">{mediumThreatSessions.length}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
          <div className="card p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Medium Threats</p>
                <p className="text-3xl font-bold text-yellow-600">{lowThreatSessions.length}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="card p-6 border-l-4 border-primary-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Sessions Analyzed</p>
                <p className="text-3xl font-bold text-primary-600">{threatSessions.length}</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-xl">
                <Shield className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Top Attack Intents (MITRE ATT&CK)</h2>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(intentCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([intent, count]) => (
                  <span
                    key={intent}
                    className={cn('badge', getIntentColor(intent))}
                  >
                    {intent.replace(/_/g, ' ')} ({count})
                  </span>
                ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">High-Risk Sessions</h2>
              <Link href="/sessions" className="text-sm text-primary-600 hover:text-primary-700">
                View all
              </Link>
            </div>
            <div className="table-container max-h-96 overflow-y-auto">
              <table className="table">
                <thead className="sticky top-0 bg-white z-10">
                  <tr>
                    <th>Session</th>
                    <th>Attacker</th>
                    <th>Intents</th>
                    <th>Commands</th>
                    <th>Threat Score</th>
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {highThreatSessions.slice(0, 10).map((session) => (
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
                        <div className="flex flex-wrap gap-1">
                          {(session.intent_history ?? []).slice(0, 2).map((intent) => (
                            <span key={intent} className={cn('badge text-xs', getIntentColor(intent))}>
                              {intent.replace(/_/g, ' ')}
                            </span>
                          ))}
                          {(session.intent_history ?? []).length > 2 && (
                            <span className="badge bg-gray-100 text-gray-600 text-xs">
                              +{(session.intent_history ?? []).length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{session.command_count ?? 0}</td>
                      <td>
                        <span className={cn('badge font-mono bg-red-100 text-red-800')}>
                          {(session.threat_score ?? 0)}/100
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">{formatTimestamp(session.start_time)}</td>
                    </tr>
                  ))}
                  {highThreatSessions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No high-risk sessions detected
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Threat Activity</h2>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {sessionsArray
                .filter((s) => (s.threat_score ?? 0) > 0)
                .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                .slice(0, 10)
                .map((session) => (
                  <Link
                    key={session.session_id}
                    href={`/sessions/${session.session_id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center',
                          (session.threat_score ?? 0) >= 70 ? 'bg-red-100' :
                          (session.threat_score ?? 0) >= 40 ? 'bg-yellow-100' : 'bg-green-100'
                        )}
                      >
                        <AlertTriangle
                          className={cn(
                            'w-5 h-5',
                            (session.threat_score ?? 0) >= 70 ? 'text-red-600' :
                            (session.threat_score ?? 0) >= 40 ? 'text-yellow-600' : 'text-green-600'
                          )}
                        />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {session.session_id.slice(0, 12)}...
                        </p>
                        <p className="text-xs text-gray-500">{session.src_ip ?? session.attacker_ip ?? 'unknown'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn('badge font-mono', getSeverityColor(
                        (session.threat_score ?? 0) >= 70 ? 'critical' :
                        (session.threat_score ?? 0) >= 40 ? 'high' : 'low'
                      ))}>
                        {(session.threat_score ?? 0)}/100
                      </span>
                      <p className="text-xs text-gray-500 mt-1">{formatTimestamp(session.start_time)}</p>
                    </div>
                  </Link>
                ))}
              {sessionsArray.filter((s) => (s.threat_score ?? 0) > 0).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No threat activity detected yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
  );
}