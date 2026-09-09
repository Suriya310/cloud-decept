'use client';

import { cn, formatTimestamp, getSeverityColor, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { useEffect, useState, useMemo } from 'react';
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
  RefreshCw,
  Layers,
  Database,
} from 'lucide-react';
import Link from 'next/link';

export default function ThreatIntelPage() {
  const {
    sessions,
    fetchSessions,
    threatIntelItems,
    fetchThreatIntelItems,
    mitreTechniques,
    fetchMitreTechniques,
    connectionStatus,
    fetchConnectionStatus,
  } = useDashboardStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [viewMode, setViewMode] = useState<'overview' | 'iocs' | 'techniques'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchSessions({ limit: 200, hours: 8760 }),
        fetchThreatIntelItems({ limit: 100 }),
        fetchMitreTechniques(),
        fetchConnectionStatus(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [fetchSessions, fetchThreatIntelItems, fetchMitreTechniques, fetchConnectionStatus]);

  const sessionsArray = sessions ?? [];
  const iocsArray = threatIntelItems ?? [];
  const techniquesArray = mitreTechniques ?? [];

  const threatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) > 0);
  const highThreatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) >= 70);
  const mediumThreatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) >= 40 && (s.threat_score ?? 0) < 70);
  const lowThreatSessions = sessionsArray.filter((s) => (s.threat_score ?? 0) > 0 && (s.threat_score ?? 0) < 40);

  const intentCounts = useMemo(() => {
    return sessionsArray.flatMap((s) => s.intent_history ?? []).reduce((acc, intent) => {
      acc[intent] = (acc[intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [sessionsArray]);

  // Filtered IOCs
  const filteredIOCs = useMemo(() => {
    return iocsArray.filter((ioc) => {
      const matchesSearch =
        ioc.ioc_value.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ioc.ioc_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ioc.context ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity =
        selectedSeverity === 'all' || (ioc.severity || '').toLowerCase() === selectedSeverity.toLowerCase();
      return matchesSearch && matchesSeverity;
    });
  }, [iocsArray, searchQuery, selectedSeverity]);

  // Filtered Techniques
  const filteredTechniques = useMemo(() => {
    return techniquesArray.filter((t) =>
      t.technique.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [techniquesArray, searchQuery]);

  // Connection status
  const isApiHealthy = connectionStatus?.connected ?? false;

  return (
    <main className="p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Threat Intelligence</h1>
          <p className="text-gray-500 mt-1">MITRE ATT&CK mapping, IOC extraction, and threat analytics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search threats, IOCs, techniques..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          {viewMode === 'iocs' && (
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
          )}
          <button
            onClick={loadAll}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            title="Refresh threat intel"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setViewMode('overview')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            viewMode === 'overview'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <Shield className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setViewMode('iocs')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            viewMode === 'iocs'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <Database className="w-4 h-4" />
          Indicators of Compromise (IOCs)
          {iocsArray.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
              {iocsArray.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode('techniques')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            viewMode === 'techniques'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <Layers className="w-4 h-4" />
          MITRE ATT&CK Matrix
          {techniquesArray.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
              {techniquesArray.length}
            </span>
          )}
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {viewMode === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric Cards */}
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
                  <p className="text-sm text-gray-500">Total Analyzed</p>
                  <p className="text-3xl font-bold text-primary-600">{threatSessions.length}</p>
                </div>
                <div className="p-3 bg-primary-100 rounded-xl">
                  <Shield className="w-6 h-6 text-primary-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Top Intents */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Top Attack Intents</h2>
              <span className="text-xs text-gray-500">Classified by Intent Classifier</span>
            </div>
            <div className="p-4">
              {Object.keys(intentCounts).length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">No intent data available</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(intentCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([intent, count]) => (
                      <span key={intent} className={cn('badge text-sm', getIntentColor(intent))}>
                        {intent.replace(/_/g, ' ')} ({count})
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* High-Risk Sessions & Recent Threat Activity */}
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
                      <th>Threat Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highThreatSessions.slice(0, 10).map((session) => (
                      <tr key={session.session_id} className="cursor-pointer hover:bg-gray-50">
                        <td className="font-mono text-xs">
                          <Link href={`/sessions/${session.session_id}`} className="text-primary-600 hover:underline">
                            {session.session_id.slice(0, 12)}...
                          </Link>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-xs">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span>{session.src_ip ?? session.attacker_ip ?? 'unknown'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(session.intent_history ?? []).slice(0, 2).map((intent) => (
                              <span key={intent} className={cn('badge text-xs', getIntentColor(intent))}>
                                {intent.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className="badge font-mono bg-red-100 text-red-800">
                            {(session.threat_score ?? 0)}/100
                          </span>
                        </td>
                      </tr>
                    ))}
                    {highThreatSessions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
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
                  .slice(0, 8)
                  .map((session) => (
                    <Link
                      key={session.session_id}
                      href={`/sessions/${session.session_id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            (session.threat_score ?? 0) >= 70 ? 'bg-red-100 text-red-600' :
                            (session.threat_score ?? 0) >= 40 ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'
                          )}
                        >
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-mono text-sm font-medium text-gray-900">
                            {session.session_id.slice(0, 12)}...
                          </p>
                          <p className="text-xs text-gray-500">{session.src_ip ?? session.attacker_ip ?? 'unknown'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="badge font-mono bg-red-100 text-red-800">
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
        </div>
      )}

      {/* IOCs TAB */}
      {viewMode === 'iocs' && (
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Extracted Indicators of Compromise</h2>
            <span className="text-xs text-gray-500">{filteredIOCs.length} indicators found</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Severity</th>
                  <th>Context</th>
                  <th>Techniques</th>
                  <th>Confidence</th>
                  <th>First Seen</th>
                </tr>
              </thead>
              <tbody>
                {filteredIOCs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      No indicators found matching the criteria.
                    </td>
                  </tr>
                ) : (
                  filteredIOCs.map((ioc) => (
                    <tr key={ioc.id}>
                      <td>
                        <span className="badge bg-blue-100 text-blue-800">{ioc.ioc_type}</span>
                      </td>
                      <td className="font-mono text-sm font-medium">{ioc.ioc_value}</td>
                      <td>
                        <span className={cn('badge', getSeverityColor(ioc.severity || 'medium'))}>
                          {ioc.severity || 'medium'}
                        </span>
                      </td>
                      <td className="text-sm text-gray-600 max-w-xs truncate">{ioc.context || '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(ioc.mitre_techniques || []).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs">{Math.round((ioc.confidence || 1) * 100)}%</span>
                      </td>
                      <td className="text-sm text-gray-500">{formatTimestamp(ioc.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TECHNIQUES TAB */}
      {viewMode === 'techniques' && (
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Detected MITRE ATT&CK Techniques</h2>
            <span className="text-xs text-gray-500">{filteredTechniques.length} techniques identified</span>
          </div>
          <div className="p-4">
            {filteredTechniques.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Layers className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p>No techniques captured yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredTechniques.map((tech) => (
                  <div key={tech.technique} className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm font-semibold text-primary-700">{tech.technique}</p>
                      <p className="text-xs text-gray-500 mt-1">Observed in attacks</p>
                    </div>
                    <span className="px-2.5 py-1 bg-primary-100 text-primary-800 rounded-full font-mono text-xs font-bold">
                      {tech.count}x
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}