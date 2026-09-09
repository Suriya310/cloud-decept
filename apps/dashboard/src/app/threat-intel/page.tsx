'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  AlertTriangle,
  Shield,
  Eye,
  MapPin,
  Clock,
  Terminal,
  FileText,
  RefreshCw,
  Layers,
  Database,
  Copy,
  Check,
  Flame,
} from 'lucide-react';
import { cn, formatTimestamp, getSeverityColor, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { evaluateThreat } from '@/lib/threatScore';
import { safeCopyToClipboard } from '@/lib/clipboard';

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

  const {
    threatDistribution,
    topIntents,
    totalSessions,
    refresh: refreshStats,
  } = useDashboardStats();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [viewMode, setViewMode] = useState<'overview' | 'iocs' | 'techniques'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshStats(),
        fetchSessions({ limit: 100, hours: 8760 }),
        fetchThreatIntelItems({ limit: 100 }),
        fetchMitreTechniques(),
        fetchConnectionStatus(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshStats, fetchSessions, fetchThreatIntelItems, fetchMitreTechniques, fetchConnectionStatus]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const sessionsArray = sessions ?? [];
  const iocsArray = threatIntelItems ?? [];
  const techniquesArray = mitreTechniques ?? [];

  const highRiskSessions = useMemo(() => {
    return sessionsArray
      .map((s) => ({
        session: s,
        threat: evaluateThreat(s.threat_score ?? s.skill_level),
      }))
      .filter((item) => item.threat.isHighRisk)
      .slice(0, 10);
  }, [sessionsArray]);

  // Filtered IOCs
  const filteredIOCs = useMemo(() => {
    return iocsArray.filter((ioc) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        ioc.ioc_value.toLowerCase().includes(q) ||
        ioc.ioc_type.toLowerCase().includes(q) ||
        (ioc.context ?? '').toLowerCase().includes(q);
      const matchesSeverity =
        selectedSeverity === 'all' ||
        (ioc.severity || '').toLowerCase() === selectedSeverity.toLowerCase();
      return matchesSearch && matchesSeverity;
    });
  }, [iocsArray, searchQuery, selectedSeverity]);

  // Filtered Techniques
  const filteredTechniques = useMemo(() => {
    return techniquesArray.filter((t) => {
      const q = searchQuery.toLowerCase();
      return !q || t.technique.toLowerCase().includes(q);
    });
  }, [techniquesArray, searchQuery]);

  // Connection status
  const isApiHealthy = connectionStatus?.connected ?? false;

  return (
    <main className="p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Threat Intelligence & MITRE Correlation</h1>
          <p className="text-gray-500 mt-1">
            Real-time adversary technique tagging, IOC identification, and historical threat distribution
          </p>
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
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
            title="Refresh threat intel"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setViewMode('overview')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            viewMode === 'overview'
              ? 'border-primary-600 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <Shield className="w-4 h-4" />
          Threat Overview
        </button>
        <button
          onClick={() => setViewMode('iocs')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            viewMode === 'iocs'
              ? 'border-primary-600 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <Database className="w-4 h-4" />
          Indicators of Compromise (IOCs)
          {iocsArray.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full font-mono">
              {iocsArray.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode('techniques')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
            viewMode === 'techniques'
              ? 'border-primary-600 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <Layers className="w-4 h-4" />
          MITRE ATT&CK Matrix
          {techniquesArray.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full font-mono">
              {techniquesArray.length}
            </span>
          )}
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {viewMode === 'overview' && (
        <div className="space-y-6">
          {/* Key Metric Cards - Authoritative All-Time ClickHouse Distribution */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Threat Classification (All-Time Authoritative)
              </h2>
              <span className="text-xs text-gray-400">Primary ClickHouse Telemetry</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-5 border-l-4 border-red-500 bg-red-50/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Critical Threats</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">
                      {(threatDistribution.critical || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Skill rating 8 - 10</p>
                  </div>
                  <div className="p-3 bg-red-100 rounded-xl">
                    <Flame className="w-6 h-6 text-red-600" />
                  </div>
                </div>
              </div>

              <div className="card p-5 border-l-4 border-orange-500 bg-orange-50/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">High Threats</p>
                    <p className="text-2xl font-bold text-orange-600 mt-1">
                      {(threatDistribution.high || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Skill rating 5 - 7</p>
                  </div>
                  <div className="p-3 bg-orange-100 rounded-xl">
                    <AlertTriangle className="w-6 h-6 text-orange-600" />
                  </div>
                </div>
              </div>

              <div className="card p-5 border-l-4 border-amber-500 bg-amber-50/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Medium Threats</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">
                      {(threatDistribution.medium || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Skill rating 3 - 4</p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-xl">
                    <Shield className="w-6 h-6 text-amber-600" />
                  </div>
                </div>
              </div>

              <div className="card p-5 border-l-4 border-emerald-500 bg-emerald-50/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Low Threats</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">
                      {(threatDistribution.low || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Automated script probes (1 - 2)</p>
                  </div>
                  <div className="p-3 bg-emerald-100 rounded-xl">
                    <Shield className="w-6 h-6 text-emerald-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Intents */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">MITRE Intent Distribution</h2>
                <p className="text-xs text-gray-500">Adversary intent classified from command sequences</p>
              </div>
              <span className="text-xs font-medium text-gray-500">
                {topIntents.reduce((acc, i) => acc + i.count, 0).toLocaleString()} total occurrences
              </span>
            </div>
            <div className="p-4">
              {topIntents.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">No intent data available</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {topIntents.map((item) => {
                    const norm = normalizeIntent(item.intent);
                    return (
                      <span
                        key={item.intent}
                        className={cn('badge text-xs px-3 py-1', getIntentColor(item.intent))}
                        title={norm.description}
                      >
                        {norm.label} ({item.count.toLocaleString()})
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* High-Risk Sessions & Recent Threat Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* High-Risk Sessions */}
            <div className="card">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">High-Risk Sessions</h2>
                  <p className="text-xs text-gray-500">Sessions evaluated as High or Critical severity</p>
                </div>
                <Link href="/sessions" className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                  View all sessions →
                </Link>
              </div>
              <div className="table-container max-h-96 overflow-y-auto">
                <table className="table">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th>Session</th>
                      <th>Attacker</th>
                      <th>Country</th>
                      <th>Threat Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {highRiskSessions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-xs">
                          No active high-risk sessions detected in current sample
                        </td>
                      </tr>
                    ) : (
                      highRiskSessions.map(({ session, threat }) => {
                        const ip = session.src_ip ?? session.attacker_ip ?? 'unknown';
                        const country = getCountryName(session.src_country || session.country);

                        return (
                          <tr key={session.session_id} className="hover:bg-gray-50">
                            <td className="font-mono text-xs">
                              <Link
                                href={`/sessions/${session.session_id}`}
                                className="text-primary-600 hover:underline font-semibold"
                              >
                                {session.session_id.slice(0, 12)}...
                              </Link>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5 font-mono text-xs">
                                <span>{ip}</span>
                                <button
                                  onClick={(e) => handleCopy(ip, `ip-${session.session_id}`, e)}
                                  className="text-gray-400 hover:text-gray-600 p-0.5"
                                  title="Copy IP"
                                >
                                  {copiedKey === `ip-${session.session_id}` ? (
                                    <Check className="w-3 h-3 text-green-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="text-xs text-gray-600 truncate max-w-[120px]" title={country}>
                              {country}
                            </td>
                            <td>
                              <span
                                className={cn(
                                  'badge text-xs font-bold',
                                  threat.badgeBg,
                                  threat.badgeColor
                                )}
                                title={threat.description}
                              >
                                {threat.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Analyzed Activity */}
            <div className="card">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Recent Analyzed Sessions</h2>
                  <p className="text-xs text-gray-500">Live honeypot session threat assessments</p>
                </div>
              </div>
              <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {sessionsArray.slice(0, 7).map((session) => {
                  const threat = evaluateThreat(session.threat_score ?? session.skill_level);
                  const ip = session.src_ip ?? session.attacker_ip ?? 'unknown';

                  return (
                    <Link
                      key={session.session_id}
                      href={`/sessions/${session.session_id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-9 h-9 rounded-lg flex items-center justify-center',
                            threat.badgeBg,
                            threat.badgeColor
                          )}
                        >
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-mono text-xs font-semibold text-gray-900">
                            {session.session_id.slice(0, 14)}...
                          </p>
                          <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span>{ip}</span>
                            <span>•</span>
                            <span>{getCountryName(session.src_country || session.country)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={cn(
                            'badge text-xs font-bold',
                            threat.badgeBg,
                            threat.badgeColor
                          )}
                        >
                          {threat.label}
                        </span>
                        <p className="text-[11px] text-gray-400 mt-1 font-mono">
                          {formatTimestamp(session.start_time)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IOCs TAB */}
      {viewMode === 'iocs' && (
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Extracted Indicators of Compromise (IOCs)</h2>
              <p className="text-xs text-gray-500">Autonomous extraction from commands, downloaded artifacts, and payloads</p>
            </div>
            <span className="text-xs font-medium text-gray-500">{filteredIOCs.length} indicators found</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Indicator Value</th>
                  <th>Severity</th>
                  <th>Context</th>
                  <th>MITRE Techniques</th>
                  <th>Confidence</th>
                  <th>First Observed</th>
                </tr>
              </thead>
              <tbody>
                {filteredIOCs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      No indicators match the search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredIOCs.map((ioc, idx) => (
                    <tr key={ioc.id || idx}>
                      <td>
                        <span className="badge bg-blue-100 text-blue-800 text-xs">{ioc.ioc_type}</span>
                      </td>
                      <td className="font-mono text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span>{ioc.ioc_value}</span>
                          <button
                            onClick={(e) => handleCopy(ioc.ioc_value, `ioc-${idx}`, e)}
                            className="text-gray-400 hover:text-gray-600 p-0.5"
                            title="Copy IOC value"
                          >
                            {copiedKey === `ioc-${idx}` ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className={cn('badge text-xs', getSeverityColor(ioc.severity || 'medium'))}>
                          {ioc.severity || 'medium'}
                        </span>
                      </td>
                      <td className="text-xs text-gray-600 max-w-xs truncate">{ioc.context || '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(ioc.mitre_techniques || []).map((t) => (
                            <span key={t} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-700 rounded font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs font-semibold">
                          {Math.round((ioc.confidence || 1) * 100)}%
                        </span>
                      </td>
                      <td className="text-xs text-gray-500 whitespace-nowrap">
                        {formatTimestamp(ioc.created_at)}
                      </td>
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
            <div>
              <h2 className="text-base font-semibold text-gray-900">Correlated MITRE ATT&CK Techniques</h2>
              <p className="text-xs text-gray-500">Techniques mapped by Rule-Based & Pattern Summarizers</p>
            </div>
            <span className="text-xs font-medium text-gray-500">{filteredTechniques.length} techniques identified</span>
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
                      <p className="text-xs text-gray-500 mt-1">Observed in honeypot attacks</p>
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