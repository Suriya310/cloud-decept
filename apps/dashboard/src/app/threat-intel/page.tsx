'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Shield,
  Search,
  AlertTriangle,
  AlertOctagon,
  FileText,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  Database,
  Globe,
  Radio,
  Clock,
  Layers,
} from 'lucide-react';
import { cn, formatTimestamp } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { evaluateThreat } from '@/lib/threatScore';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function ThreatIntelligencePage() {
  const {
    sessions,
    fetchSessions,
    threatIntelItems,
    fetchThreatIntelItems,
    stats,
    fetchStats,
    timeWindowHours,
  } = useDashboardStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetchThreatIntelItems({ limit: 100 });
    fetchSessions({ hours: timeWindowHours, limit: 300 });
    fetchStats(timeWindowHours);
  }, [fetchThreatIntelItems, fetchSessions, fetchStats, timeWindowHours]);

  const copyToClipboard = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const iocList = threatIntelItems || [];

  const filteredIocs = useMemo(() => {
    return iocList.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        item.ioc_value.toLowerCase().includes(q) ||
        item.ioc_type.toLowerCase().includes(q) ||
        item.context.toLowerCase().includes(q);

      const matchesSeverity = selectedSeverity === 'all' || item.severity.toLowerCase() === selectedSeverity.toLowerCase();
      return matchesSearch && matchesSeverity;
    });
  }, [iocList, searchQuery, selectedSeverity]);

  // Threat severity breakdown from stats
  const threatCounts = useMemo(() => {
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unclassified: 0,
    };

    (stats?.threat_distribution || []).forEach((td) => {
      const lvl = td.level.toLowerCase();
      if (lvl === 'critical') counts.critical = td.count;
      else if (lvl === 'high') counts.high = td.count;
      else if (lvl === 'medium') counts.medium = td.count;
      else if (lvl === 'low') counts.low = td.count;
    });

    const evaluated = counts.critical + counts.high + counts.medium + counts.low;
    counts.unclassified = Math.max(0, (stats?.total_sessions || 0) - evaluated);
    return counts;
  }, [stats]);

  // High risk sessions
  const highRiskSessions = useMemo(() => {
    const list = sessions || [];
    return list
      .filter((s) => (s.skill_level ?? s.threat_score ?? 0) >= 4)
      .slice(0, 10);
  }, [sessions]);

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white uppercase flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-cyan-400" />
            <span>THREAT INTELLIGENCE & ADVERSARY CLASSIFICATION</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Indicators of Compromise (IOCs), adversarial skill evaluations, and threat taxonomy ({timeWindowHours >= 87600 ? 'All-Time' : `Last ${timeWindowHours}h`})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              fetchThreatIntelItems({ limit: 100 });
              fetchSessions({ hours: timeWindowHours, limit: 300 });
              fetchStats(timeWindowHours);
            }}
            className="p-2 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 hover:text-cyan-300"
            title="Refresh threat intel"
          >
            <RefreshCw className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* Threat Posture Taxonomy Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-[#070e22] border border-rose-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-rose-400 uppercase font-bold">CRITICAL</span>
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{threatCounts.critical}</div>
          <span className="text-[9px] text-slate-400">Hostile / Exploit Payloads</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#070e22] border border-orange-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-orange-400 uppercase font-bold">HIGH RISK</span>
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{threatCounts.high}</div>
          <span className="text-[9px] text-slate-400">Aggressive Probing</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#070e22] border border-amber-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-amber-400 uppercase font-bold">MEDIUM RISK</span>
            <Shield className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{threatCounts.medium}</div>
          <span className="text-[9px] text-slate-400">Reconnaissance & Scan</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#070e22] border border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-emerald-400 uppercase font-bold">LOW RISK</span>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{threatCounts.low}</div>
          <span className="text-[9px] text-slate-400">Benign / Port Discovery</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#070e22] border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">UNCLASSIFIED</span>
            <Clock className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-slate-300 mt-1">{threatCounts.unclassified}</div>
          <span className="text-[9px] text-slate-400">Pre-Auth / Zero Cmds</span>
        </div>
      </div>

      {/* Semantic Distinction Alert */}
      <div className="p-3 bg-[#070e22] border border-cyan-500/15 rounded-xl text-xs text-slate-400 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-200">Semantic Classification Standard: </span>
          Sessions labeled <span className="text-slate-200 font-bold">UNCLASSIFIED</span> represent connections with insufficient command executions to trigger heuristic IOC evaluation (92.5% of sessions exit pre-auth). <span className="text-amber-300 font-bold">UNKNOWN</span> represents sessions where command patterns did not match the cloud-specific regex rules.
        </div>
      </div>

      {/* High-Risk Active Sessions */}
      <div className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden space-y-0">
        <div className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400" />
            <span>CRITICAL & HIGH-RISK THREAT SESSIONS</span>
          </h3>
          <span className="text-[10px] text-slate-400">{highRiskSessions.length} Captured</span>
        </div>

        <div className="divide-y divide-cyan-500/10">
          {highRiskSessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No high-risk sessions observed in current window.
            </div>
          ) : (
            highRiskSessions.map((s) => {
              const ip = s.src_ip || s.attacker_ip || 'unknown';
              const threat = evaluateThreat(s.threat_score ?? s.skill_level);
              const intent = normalizeIntent(s.intent);

              return (
                <div
                  key={s.session_id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-cyan-950/20 transition-all text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border', threat.badgeClass)}>
                        {threat.label.toUpperCase()} ({s.skill_level}/10)
                      </span>
                      <span className="font-bold text-white">{ip}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">{getCountryName(s.src_country || s.country)}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-cyan-300 font-bold">{intent.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Session {s.session_id} • Commands: {s.command_count || s.commands_executed || 0} • Duration: {s.duration_seconds || 0}s
                    </div>
                  </div>

                  <Link
                    href={`/sessions/${s.session_id}`}
                    className="flex items-center gap-1 px-3 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/25 transition-all w-fit"
                  >
                    <span>INVESTIGATE CASE</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Extracted IOCs Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#070e22] p-3 rounded-xl border border-cyan-500/20">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
            <input
              type="search"
              placeholder="Search IOC value, type, context..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#040816] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#040816] border border-cyan-500/25 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All IOC Severities</option>
              <option value="critical">Critical Only</option>
              <option value="high">High Only</option>
              <option value="medium">Medium Only</option>
              <option value="low">Low Only</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#040816] text-[10px] text-slate-400 uppercase border-b border-cyan-500/15">
                <tr>
                  <th className="py-3 px-4">SEVERITY</th>
                  <th className="py-3 px-4">IOC TYPE</th>
                  <th className="py-3 px-4">INDICATOR VALUE</th>
                  <th className="py-3 px-4">CONFIDENCE</th>
                  <th className="py-3 px-4">CONTEXT</th>
                  <th className="py-3 px-4">FIRST SEEN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/10 font-mono">
                {filteredIocs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No standalone threat indicators match current query.
                    </td>
                  </tr>
                ) : (
                  filteredIocs.map((ioc, idx) => (
                    <tr key={ioc.id || idx} className="hover:bg-cyan-950/20">
                      <td className="py-2.5 px-4">
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[9px] font-bold border uppercase',
                          ioc.severity === 'critical' ? 'bg-rose-950/50 text-rose-300 border-rose-500/40' :
                          ioc.severity === 'high' ? 'bg-orange-950/50 text-orange-300 border-orange-500/40' :
                          ioc.severity === 'medium' ? 'bg-amber-950/50 text-amber-300 border-amber-500/40' :
                          'bg-emerald-950/50 text-emerald-300 border-emerald-500/40'
                        )}>
                          {ioc.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-cyan-300 uppercase text-[10px]">{ioc.ioc_type}</td>
                      <td className="py-2.5 px-4 font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{ioc.ioc_value}</span>
                          <button
                            onClick={(e) => copyToClipboard(ioc.ioc_value, `ioc-${idx}`, e)}
                            className="text-slate-500 hover:text-cyan-300"
                          >
                            {copiedKey === `ioc-${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300">{(ioc.confidence * 100).toFixed(0)}%</td>
                      <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">{ioc.context}</td>
                      <td className="py-2.5 px-4 text-slate-400">{formatTimestamp(ioc.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}