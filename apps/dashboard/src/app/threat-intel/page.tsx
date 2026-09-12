'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  AlertTriangle,
  Shield,
  FileText,
  RefreshCw,
  Layers,
  Database,
  Copy,
  Check,
  Flame,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { cn, formatTimestamp, getSeverityColor, getIntentColor } from '@/lib/utils';
import { useDashboardStore, transformSession } from '@/lib/store';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { api } from '@/lib/api';
import { Session } from '@/lib/types';
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
  const [highRiskSessionsFromDb, setHighRiskSessionsFromDb] = useState<Session[]>([]);

  const handleCopy = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const timeWindowHours = useDashboardStore((s) => s.timeWindowHours);

  const loadAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [,,, highRiskData] = await Promise.all([
        refreshStats(),
        fetchSessions({ limit: 100, hours: timeWindowHours }),
        fetchThreatIntelItems({ limit: 100 }),
        api.getSessions({ min_skill_level: 5, limit: 20, hours: timeWindowHours }).catch(() => ({ sessions: [], total: 0 })),
        fetchMitreTechniques(),
        fetchConnectionStatus(),
      ]);
      const sessionList = (highRiskData as any)?.sessions;
      if (Array.isArray(sessionList) && sessionList.length > 0) {
        setHighRiskSessionsFromDb(sessionList.map(transformSession));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshStats, fetchSessions, fetchThreatIntelItems, fetchMitreTechniques, fetchConnectionStatus, timeWindowHours]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const sessionsArray = sessions ?? [];
  const iocsArray = threatIntelItems ?? [];
  const techniquesArray = mitreTechniques ?? [];

  const highRiskSessions = useMemo(() => {
    const list = highRiskSessionsFromDb.length > 0 ? highRiskSessionsFromDb : sessionsArray;
    return list
      .map((s) => ({
        session: s,
        threat: evaluateThreat(s.threat_score ?? s.skill_level),
      }))
      .filter((item) => item.threat.isHighRisk)
      .slice(0, 8);
  }, [highRiskSessionsFromDb, sessionsArray]);

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

  const filteredTechniques = useMemo(() => {
    return techniquesArray.filter((t) => {
      const q = searchQuery.toLowerCase();
      return !q || t.technique.toLowerCase().includes(q);
    });
  }, [techniquesArray, searchQuery]);

  return (
    <div className="space-y-6 font-mono">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white uppercase flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-cyan-400" />
            <span>THREAT INTELLIGENCE & MITRE MATRIX</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative ClickHouse adversary classifications, PostgreSQL IOC extractions, and MITRE technique frequency
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
            <input
              type="search"
              placeholder="Search IOCs, techniques, hashes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {viewMode === 'iocs' && (
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 focus:outline-none focus:border-cyan-400"
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
            className="p-1.5 rounded-lg bg-[#070e22] border border-cyan-500/30 text-slate-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
            title="Refresh threat intel"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin text-cyan-400')} />
          </button>
        </div>
      </div>

      {/* Cyber Mode Switcher */}
      <div className="flex border-b border-cyan-500/15">
        <button
          onClick={() => setViewMode('overview')}
          className={cn(
            'px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2',
            viewMode === 'overview'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Shield className="w-3.5 h-3.5" />
          THREAT OVERVIEW
        </button>
        <button
          onClick={() => setViewMode('iocs')}
          className={cn(
            'px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2',
            viewMode === 'iocs'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Database className="w-3.5 h-3.5" />
          IOC FEED
          {iocsArray.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
              {iocsArray.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode('techniques')}
          className={cn(
            'px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2',
            viewMode === 'techniques'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          MITRE ATT&CK MATRIX
          {techniquesArray.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
              {techniquesArray.length}
            </span>
          )}
        </button>
      </div>

      {/* VIEW: OVERVIEW */}
      {viewMode === 'overview' && (
        <div className="space-y-6">
          {/* 4 Threat Classification Tiers */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="glass-panel p-4 rounded-xl border border-rose-500/30 relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase mb-1">
                <span>CRITICAL THREATS</span>
                <Flame className="w-4 h-4 text-rose-400 animate-pulse" />
              </div>
              <div className="text-2xl font-black text-rose-400 glow-rose">
                {(threatDistribution.critical || 0).toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Skill level 8 - 10 • Exploit payload</p>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-orange-500/30">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase mb-1">
                <span>HIGH THREATS</span>
                <AlertTriangle className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-2xl font-black text-orange-400">
                {(threatDistribution.high || 0).toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Skill level 5 - 7 • Active probing</p>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-amber-500/30">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase mb-1">
                <span>MEDIUM THREATS</span>
                <Shield className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black text-amber-400">
                {(threatDistribution.medium || 0).toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Skill level 3 - 4 • Discovery scan</p>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-emerald-500/30">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase mb-1">
                <span>LOW THREATS</span>
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-emerald-400">
                {(threatDistribution.low || 0).toLocaleString()}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Skill level 1 - 2 • Automated bot probe</p>
            </div>
          </div>

          {/* High-Risk Sessions Investigation */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl">
            <div className="p-4 border-b border-cyan-500/15 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                  HIGH-RISK FORENSIC INCIDENTS (SKILL LEVEL ≥ 5)
                </h2>
                <p className="text-[10px] text-slate-400 mt-0.5">Authoritative sessions flagged with High or Critical capability</p>
              </div>
              <Link href="/sessions" className="text-xs text-cyan-400 hover:text-cyan-300 font-bold">
                VIEW ALL →
              </Link>
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Session ID</th>
                    <th>Attacker IP</th>
                    <th>Country</th>
                    <th>Threat Level</th>
                    <th>Commands</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {highRiskSessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500 text-xs font-mono">
                        No high-risk or critical capability incidents recorded in active honeypot logs.
                      </td>
                    </tr>
                  ) : (
                    highRiskSessions.map(({ session, threat }) => {
                      const ip = session.src_ip ?? session.attacker_ip ?? 'unknown';
                      const country = getCountryName(session.src_country || session.country);

                      return (
                        <tr key={session.session_id} className="text-xs">
                          <td>
                            <Link href={`/sessions/${session.session_id}`} className="font-bold text-cyan-400 hover:underline">
                              {session.session_id.slice(0, 12)}...
                            </Link>
                          </td>
                          <td className="text-white font-bold">{ip}</td>
                          <td className="text-slate-300">{country}</td>
                          <td>
                            <span className={cn('badge text-[10px] font-bold', threat.badgeClass)}>
                              {threat.label}
                            </span>
                          </td>
                          <td className="text-white">{(session.command_count ?? 0).toLocaleString()}</td>
                          <td>
                            <Link
                              href={`/sessions/${session.session_id}`}
                              className="text-xs text-cyan-400 hover:text-cyan-200 underline"
                            >
                              Inspect Console
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: IOC STREAM */}
      {viewMode === 'iocs' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl">
          <div className="p-4 border-b border-cyan-500/15 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                INDICATORS OF COMPROMISE (IOCS)
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Payloads, IPs, and command artifacts</p>
            </div>
            <span className="text-xs text-cyan-400 font-bold">{filteredIOCs.length} indicators indexed</span>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Indicator Artifact Value</th>
                  <th>Severity</th>
                  <th>Context Description</th>
                  <th>Techniques</th>
                  <th>Confidence</th>
                  <th>Observed</th>
                </tr>
              </thead>
              <tbody>
                {filteredIOCs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-slate-500 text-xs">
                      No indicators match the search or severity criteria.
                    </td>
                  </tr>
                ) : (
                  filteredIOCs.map((ioc, idx) => (
                    <tr key={ioc.id || idx} className="text-xs">
                      <td>
                        <span className="badge text-[10px] bg-cyan-950 text-cyan-300 border-cyan-500/30 font-bold">
                          {ioc.ioc_type}
                        </span>
                      </td>
                      <td className="font-bold text-white max-w-sm truncate">
                        <div className="flex items-center gap-1.5">
                          <span>{ioc.ioc_value}</span>
                          <button
                            onClick={(e) => handleCopy(ioc.ioc_value, `ioc-${idx}`, e)}
                            className="text-slate-500 hover:text-cyan-300"
                            title="Copy IOC"
                          >
                            {copiedKey === `ioc-${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className={cn('badge text-[10px]', getSeverityColor(ioc.severity || 'medium'))}>
                          {ioc.severity || 'medium'}
                        </span>
                      </td>
                      <td className="text-slate-400 max-w-xs truncate">{ioc.context || '—'}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(ioc.mitre_techniques || []).map((t) => (
                            <span key={t} className="px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-300 border border-slate-700 font-mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-cyan-300 font-bold">
                        {Math.round((ioc.confidence || 1) * 100)}%
                      </td>
                      <td className="text-slate-400 whitespace-nowrap">
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

      {/* VIEW: MITRE ATT&CK MATRIX */}
      {viewMode === 'techniques' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl p-6">
          <div className="flex items-center justify-between mb-4 border-b border-cyan-500/15 pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                OBSERVED MITRE ATT&CK MATRIX
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Techniques correlated against captured command sequences</p>
            </div>
            <span className="text-xs font-bold text-cyan-400">{filteredTechniques.length} techniques active</span>
          </div>

          {filteredTechniques.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              <Layers className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p>No MITRE techniques indexed yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredTechniques.map((tech) => (
                <div
                  key={tech.technique}
                  className="p-3.5 rounded-xl bg-[#070e22] border border-cyan-500/20 hover:border-cyan-400/40 transition-all text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300">{tech.technique}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-500/30">
                      {tech.count}x
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Observed in honeypot telemetry</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}