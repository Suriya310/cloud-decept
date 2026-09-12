'use client';

import { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Target,
  Search,
  Globe,
  Terminal,
  Activity,
  Shield,
  KeyRound,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';
import { cn, formatTimestamp } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { evaluateThreat } from '@/lib/threatScore';
import { safeCopyToClipboard } from '@/lib/clipboard';

function AttackersPageContent() {
  const searchParams = useSearchParams();
  const urlIp = searchParams.get('ip') || '';

  const { topAttackers, fetchTopAttackers, sessions, fetchSessions, timeWindowHours } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState(urlIp);
  const [selectedIp, setSelectedIp] = useState<string | null>(urlIp || null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTopAttackers(timeWindowHours, 50);
    fetchSessions({ hours: timeWindowHours, limit: 300 });
  }, [fetchTopAttackers, fetchSessions, timeWindowHours]);

  const attackersList = topAttackers || [];

  // If no attacker is explicitly selected, pick the first one
  useEffect(() => {
    if (!selectedIp && attackersList.length > 0) {
      setSelectedIp(attackersList[0].attacker_ip);
    }
  }, [attackersList, selectedIp]);

  const copyToClipboard = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  // Filtered attackers
  const filteredAttackers = useMemo(() => {
    return attackersList.filter((a) => {
      const q = searchQuery.toLowerCase();
      return (
        !q ||
        a.attacker_ip.toLowerCase().includes(q) ||
        (a.country && a.country.toLowerCase().includes(q)) ||
        (a.primary_intent && a.primary_intent.toLowerCase().includes(q))
      );
    });
  }, [attackersList, searchQuery]);

  // Selected attacker object
  const selectedAttacker = useMemo(() => {
    if (!selectedIp) return null;
    return attackersList.find((a) => a.attacker_ip === selectedIp) || {
      attacker_ip: selectedIp,
      country: 'Unknown',
      total_sessions: 1,
      total_commands: 0,
      primary_intent: 'reconnaissance',
      max_skill_level: 2,
    };
  }, [attackersList, selectedIp]);

  // Sessions by this selected attacker
  const attackerSessions = useMemo(() => {
    if (!selectedIp || !sessions) return [];
    return sessions.filter((s) => (s.src_ip || s.attacker_ip) === selectedIp);
  }, [sessions, selectedIp]);

  const countryName = getCountryName(selectedAttacker?.country);
  const threat = evaluateThreat(selectedAttacker?.max_skill_level ?? 3);
  const primaryIntent = normalizeIntent(selectedAttacker?.primary_intent);

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-white uppercase flex items-center gap-2.5">
            <Target className="w-5 h-5 text-cyan-400" />
            <span>THREAT ACTOR & ATTACKER DOSSIER</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Profiling aggressive threat actors, autonomous reconnaissance tools, and credential sprayers ({timeWindowHours >= 87600 ? 'All-Time' : `Last ${timeWindowHours}h`})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              fetchTopAttackers(timeWindowHours, 50);
              fetchSessions({ hours: timeWindowHours, limit: 300 });
            }}
            className="p-2 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 hover:text-cyan-300"
            title="Refresh attackers"
          >
            <RefreshCw className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Attacker Roster */}
        <div className="lg:col-span-4 space-y-3">
          <div className="p-3 bg-[#070e22] rounded-xl border border-cyan-500/20 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
              <input
                type="search"
                placeholder="Search IP, country, intent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[#040816] border border-cyan-500/25 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-between px-1">
              <span>ACTIVE THREAT ACTORS</span>
              <span className="text-cyan-300 font-bold">{filteredAttackers.length} Ranked</span>
            </div>
          </div>

          <div className="space-y-2 max-h-[700px] overflow-y-auto scrollbar-thin pr-1">
            {filteredAttackers.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-[#070e22] border border-cyan-500/15 text-slate-500 text-xs">
                No threat actors matched your search criteria.
              </div>
            ) : (
              filteredAttackers.map((a) => {
                const isSelected = selectedIp === a.attacker_ip;
                const aThreat = evaluateThreat(a.max_skill_level ?? 2);
                const aCountry = getCountryName(a.country);

                return (
                  <div
                    key={a.attacker_ip}
                    onClick={() => setSelectedIp(a.attacker_ip)}
                    className={cn(
                      'p-3 rounded-xl border cursor-pointer transition-all',
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-md shadow-cyan-950/50'
                        : 'bg-[#070e22] border-cyan-500/15 hover:border-cyan-500/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white font-mono">{a.attacker_ip}</span>
                      <span className={cn('px-1.5 py-0.2 rounded text-[9px] font-bold border', aThreat.badgeClass)}>
                        {aThreat.label.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5">
                      <span>{aCountry}</span>
                      <span className="text-cyan-300 font-bold">
                        {a.total_sessions || a.sessions || a.unique_sessions || 0} Sessions
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 pt-1 border-t border-cyan-500/10">
                      <span>Commands: {a.total_commands ?? 0}</span>
                      <span className="text-slate-400">{normalizeIntent(a.primary_intent).label}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Attacker Profile Dossier */}
        <div className="lg:col-span-8 space-y-4">
          {selectedAttacker ? (
            <div className="space-y-4">
              {/* Dossier Card Header */}
              <div className="p-4 rounded-xl bg-[#070e22] border border-cyan-500/20 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-cyan-500/15">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-cyan-950/50 border border-cyan-500/30">
                      <Target className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base font-bold text-white tracking-wide">{selectedAttacker.attacker_ip}</span>
                        <button
                          onClick={(e) => copyToClipboard(selectedAttacker.attacker_ip, 'ip-copy', e)}
                          className="text-slate-500 hover:text-cyan-300 p-1"
                          title="Copy IP"
                        >
                          {copiedKey === 'ip-copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{countryName}</span>
                        <span>•</span>
                        <span>{primaryIntent.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/sessions?search=${encodeURIComponent(selectedAttacker.attacker_ip)}`}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-xs text-cyan-300 hover:border-cyan-400 flex items-center gap-1.5"
                    >
                      <span>VIEW ALL SESSIONS</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {/* Metric Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-lg bg-[#040816] border border-cyan-500/15">
                    <span className="text-[10px] text-slate-400 uppercase block">TOTAL SESSIONS</span>
                    <span className="text-base font-bold text-white mt-0.5 block">
                      {selectedAttacker.total_sessions || selectedAttacker.sessions || selectedAttacker.unique_sessions || attackerSessions.length || 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#040816] border border-cyan-500/15">
                    <span className="text-[10px] text-slate-400 uppercase block">TOTAL COMMANDS</span>
                    <span className="text-base font-bold text-emerald-400 mt-0.5 block">
                      {selectedAttacker.total_commands ?? 0}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#040816] border border-cyan-500/15">
                    <span className="text-[10px] text-slate-400 uppercase block">THREAT TIER</span>
                    <span className={cn('text-xs font-bold mt-1 inline-block px-1.5 py-0.5 rounded border', threat.badgeClass)}>
                      {threat.label.toUpperCase()} ({selectedAttacker.max_skill_level ?? 2}/10)
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#040816] border border-cyan-500/15">
                    <span className="text-[10px] text-slate-400 uppercase block">PRIMARY INTENT</span>
                    <span className="text-xs font-bold text-cyan-300 mt-1 block truncate">
                      {primaryIntent.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attacker Behavioral Assessment */}
              <div className="p-4 rounded-xl bg-[#070e22] border border-cyan-500/20 space-y-2">
                <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>THREAT ACTOR BEHAVIORAL PROFILE</span>
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Adversary originating from {countryName} targeting CloudDecept honeypots. Observed behavior reflects {primaryIntent.description.toLowerCase()}. The actor has initiated multiple automated SSH/telnet connection attempts, with an evaluated adversary skill score of {selectedAttacker.max_skill_level ?? 2}/10.
                </p>
              </div>

              {/* Observed Sessions for this Attacker */}
              <div className="rounded-xl border border-cyan-500/20 bg-[#070e22] overflow-hidden space-y-0">
                <div className="p-3.5 bg-[#040816] border-b border-cyan-500/15 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>RECORDED SESSIONS BY THIS ACTOR</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    {attackerSessions.length} Captured in Window
                  </span>
                </div>

                <div className="divide-y divide-cyan-500/10">
                  {attackerSessions.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No individual session rows currently loaded in local buffer for this IP. Click &quot;View All Sessions&quot; above to search full historical ClickHouse logs.
                    </div>
                  ) : (
                    attackerSessions.map((s) => (
                      <div
                        key={s.session_id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-cyan-950/20 transition-all text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-cyan-300">{s.session_id}</span>
                            <span className="text-[10px] text-slate-500">•</span>
                            <span className="text-[10px] text-slate-400">{formatTimestamp(s.start_time)}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Duration: {s.duration_seconds || 0}s • Commands: {s.command_count || s.commands_executed || 0} • Intent: {normalizeIntent(s.intent).label}
                          </div>
                        </div>

                        <Link
                          href={`/sessions/${s.session_id}`}
                          className="flex items-center gap-1 px-3 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/25 transition-all w-fit"
                        >
                          <span>OPEN CASE FILE</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center rounded-xl bg-[#070e22] border border-cyan-500/15 text-slate-400 text-xs">
              Select an attacker IP on the left to review their complete threat profile and recorded attack sessions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AttackersPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center font-mono text-xs text-slate-400">Loading telemetry interface...</div>}>
      <AttackersPageContent />
    </Suspense>
  );
}
