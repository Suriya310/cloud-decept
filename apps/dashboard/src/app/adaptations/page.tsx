'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Shield,
  Zap,
  Eye,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Info,
  MapPin,
  Flame,
  Key,
  Database,
  Cpu,
  Clock,
  Terminal,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { cn, formatTimestamp, getIntentColor } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { api } from '@/lib/api';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { safeCopyToClipboard } from '@/lib/clipboard';

interface StrategyInfo {
  name: string;
  description: string;
  action_template: string;
  icon: string;
  badgeColor: string;
}

const STRATEGY_DEFINITIONS: Record<string, StrategyInfo> = {
  credential_capture: {
    name: 'Credential Decoy Strategy',
    description: 'Autonomous strategy targeting credential access attempts with simulated decoy keys and canary triggers',
    action_template: 'Strategy Assigned: Decoy credential response profile',
    icon: 'Key',
    badgeColor: 'border-amber-500/40 text-amber-300 bg-amber-950/40',
  },
  fake_environment: {
    name: 'Synthetic Environment Strategy',
    description: 'Autonomous strategy responding to system discovery and enumeration with synthetic host profiles',
    action_template: 'Strategy Assigned: Synthetic environment response profile',
    icon: 'Database',
    badgeColor: 'border-cyan-500/40 text-cyan-300 bg-cyan-950/40',
  },
  throttle: {
    name: 'Latency Throttling Strategy',
    description: 'Autonomous strategy introducing command latency delays to disrupt automated brute-forcing',
    action_template: 'Strategy Assigned: Dynamic command latency profile',
    icon: 'Clock',
    badgeColor: 'border-blue-500/40 text-blue-300 bg-blue-950/40',
  },
  decoy_resource: {
    name: 'Decoy Cloud Storage Strategy',
    description: 'Autonomous strategy targeting exfiltration/lateral movement with decoy asset lures',
    action_template: 'Strategy Assigned: Decoy cloud storage resource profile',
    icon: 'Cpu',
    badgeColor: 'border-purple-500/40 text-purple-300 bg-purple-950/40',
  },
  session_terminate: {
    name: 'Containment Termination Strategy',
    description: 'Containment policy flagging severe privilege escalation or destructive host escape attempts',
    action_template: 'Strategy Assigned: Containment termination trigger',
    icon: 'Flame',
    badgeColor: 'border-rose-500/40 text-rose-300 bg-rose-950/40',
  },
  alert_only: {
    name: 'Passive Telemetry & Profiling',
    description: 'Continuous session telemetry logging, MITRE ATT&CK technique extraction, and behavioural profiling',
    action_template: 'Strategy Assigned: Passive telemetry and MITRE mapping',
    icon: 'Terminal',
    badgeColor: 'border-teal-500/40 text-teal-300 bg-teal-950/40',
  },
};

function mapIntentToStrategy(intent: string): { strategy: string; action: string } {
  const norm = intent.toLowerCase().replace(/-/g, '_');
  if (norm.includes('credential') || norm.includes('steal') || norm.includes('dump')) {
    return { strategy: 'credential_capture', action: STRATEGY_DEFINITIONS.credential_capture.action_template };
  }
  if (norm.includes('recon') || norm.includes('discovery') || norm.includes('system') || norm.includes('enum')) {
    return { strategy: 'fake_environment', action: STRATEGY_DEFINITIONS.fake_environment.action_template };
  }
  if (norm.includes('lateral') || norm.includes('exfiltration') || norm.includes('data') || norm.includes('s3')) {
    return { strategy: 'decoy_resource', action: STRATEGY_DEFINITIONS.decoy_resource.action_template };
  }
  if (norm.includes('damage') || norm.includes('privilege') || norm.includes('destroy') || norm.includes('escape')) {
    return { strategy: 'session_terminate', action: STRATEGY_DEFINITIONS.session_terminate.action_template };
  }
  return { strategy: 'alert_only', action: STRATEGY_DEFINITIONS.alert_only.action_template };
}

export default function AdaptationsPage() {
  const { sessions, fetchSessions } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [strategies, setStrategies] = useState<Record<string, StrategyInfo>>(STRATEGY_DEFINITIONS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const adaptationsPerPage = 20;

  const handleCopy = useCallback(async (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchSessions({ limit: 500, hours: 8760 });
      try {
        const liveStrategies = await api.getAdaptiveStrategies();
        if (liveStrategies && Object.keys(liveStrategies).length > 0) {
          setStrategies((prev) => {
            const merged = { ...prev };
            for (const [k, v] of Object.entries(liveStrategies)) {
              if (merged[k]) {
                merged[k] = { ...merged[k], ...v };
              } else {
                merged[k] = {
                  name: v.name || k,
                  description: v.description || '',
                  action_template: 'Applied deception policy',
                  icon: 'Shield',
                  badgeColor: 'border-cyan-500/40 text-cyan-300 bg-cyan-950/40',
                };
              }
            }
            return merged;
          });
        }
      } catch {
        // Fall back to built-in strategy definitions
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchSessions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sessionsArray = sessions ?? [];

  // Deterministically derive real adaptations from recorded session intents
  const adaptations = useMemo(() => {
    return sessionsArray.flatMap((session) => {
      const intents =
        session.intent_history && session.intent_history.length > 0
          ? session.intent_history
          : session.intent
          ? [session.intent]
          : ['unclassified'];

      return intents.map((intent, idx) => {
        const { strategy, action } = mapIntentToStrategy(intent);
        return {
          id: `adapt-${session.session_id}-${idx}`,
          session_id: session.session_id,
          attacker_ip: session.src_ip || session.attacker_ip || 'unknown',
          country: getCountryName(session.src_country || session.country),
          timestamp: session.start_time,
          intent,
          strategy,
          action,
          threat_score: session.threat_score ?? 0,
          status: 'Strategy Assigned',
        };
      });
    });
  }, [sessionsArray]);

  const strategyKeys = Object.keys(strategies);

  const strategyCounts = useMemo(() => {
    return adaptations.reduce((acc, a) => {
      acc[a.strategy] = (acc[a.strategy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [adaptations]);

  const filteredAdaptations = useMemo(() => {
    return adaptations.filter((adapt) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        adapt.session_id.toLowerCase().includes(q) ||
        adapt.attacker_ip.toLowerCase().includes(q) ||
        adapt.country.toLowerCase().includes(q) ||
        adapt.intent.toLowerCase().includes(q) ||
        adapt.strategy.toLowerCase().includes(q) ||
        adapt.action.toLowerCase().includes(q);

      const matchesStrategy = selectedStrategy === 'all' || adapt.strategy === selectedStrategy;
      return matchesSearch && matchesStrategy;
    });
  }, [adaptations, searchQuery, selectedStrategy]);

  const totalPages = Math.max(1, Math.ceil(filteredAdaptations.length / adaptationsPerPage));
  const paginatedAdaptations = useMemo(() => {
    return filteredAdaptations.slice(
      (currentPage - 1) * adaptationsPerPage,
      currentPage * adaptationsPerPage
    );
  }, [filteredAdaptations, currentPage, adaptationsPerPage]);

  const getStrategyIcon = (key: string) => {
    switch (key) {
      case 'credential_capture':
        return <Key className="w-4 h-4 text-amber-400" />;
      case 'fake_environment':
        return <Database className="w-4 h-4 text-cyan-400" />;
      case 'throttle':
        return <Clock className="w-4 h-4 text-blue-400" />;
      case 'decoy_resource':
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case 'session_terminate':
        return <Flame className="w-4 h-4 text-rose-400" />;
      default:
        return <Shield className="w-4 h-4 text-teal-400" />;
    }
  };

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto text-slate-100">
      {/* Header HUD */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono tracking-widest uppercase bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
              Active Defense Layer
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-xs font-mono text-cyan-300">Policy Engine Online</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono flex items-center gap-3">
            <Zap className="w-7 h-7 text-cyan-400" />
            ADAPTIVE DECEPTION & ACTIVE MITIGATION
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl font-mono">
            Dynamic deception strategies and synthetic canary injections mapped deterministically from real-time adversary intent vectors
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search policies, IPs, intents..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-56 sm:w-64 pl-9 pr-3 py-2 text-xs bg-[#050a18]/90 border border-cyan-500/20 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono transition-all"
            />
          </div>

          <select
            value={selectedStrategy}
            onChange={(e) => {
              setSelectedStrategy(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 text-xs bg-[#050a18]/90 border border-cyan-500/20 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400 font-mono min-w-[200px]"
          >
            <option value="all">ALL STRATEGIES ({adaptations.length})</option>
            {strategyKeys.map((k) => (
              <option key={k} value={k}>
                {strategies[k]?.name.toUpperCase() || k.toUpperCase()} ({strategyCounts[k] || 0})
              </option>
            ))}
          </select>

          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-cyan-500/20 bg-[#050a18]/90 text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors disabled:opacity-50"
            title="Refresh policies"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Cyber Deception Pipeline Ribbon */}
      <div className="glass-panel p-4 border border-cyan-500/20 rounded-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-3 border-b border-cyan-500/10 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase">
              Autonomous Adaptive Deception Pipeline
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Real-Time State Machine: <span className="text-emerald-400 font-bold">SYNCHRONIZED</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-center relative">
          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 flex flex-col items-center justify-center">
            <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest">PHASE 01</span>
            <span className="text-xs font-bold text-slate-200 mt-0.5">ATTACKER RECON</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5">Cowrie SSH / Telnet Probe</span>
          </div>

          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 flex flex-col items-center justify-center">
            <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest">PHASE 02</span>
            <span className="text-xs font-bold text-slate-200 mt-0.5">INTENT INFERENCE</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5">NLP Classifier & MITRE Map</span>
          </div>

          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 flex flex-col items-center justify-center">
            <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest">PHASE 03</span>
            <span className="text-xs font-bold text-slate-200 mt-0.5">POLICY RESOLUTION</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5">Adaptive Engine Strategy Matrix</span>
          </div>

          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 flex flex-col items-center justify-center">
            <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest">PHASE 04</span>
            <span className="text-xs font-bold text-slate-200 mt-0.5">SYNTHETIC INJECTION</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5">Canary Tokens & Mock Targets</span>
          </div>

          <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/20 flex flex-col items-center justify-center">
            <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-widest">PHASE 05</span>
            <span className="text-xs font-bold text-slate-200 mt-0.5">CONTAINMENT</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5">TTP Extraction & Severance</span>
          </div>
        </div>
      </div>

      {/* Strategy Catalog Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {strategyKeys.map((k) => {
          const count = strategyCounts[k] || 0;
          const isSelected = selectedStrategy === k;
          const strat = strategies[k];

          return (
            <div
              key={k}
              onClick={() => {
                setSelectedStrategy(isSelected ? 'all' : k);
                setCurrentPage(1);
              }}
              className={cn(
                'glass-panel p-3.5 rounded-xl cursor-pointer transition-all duration-200 border flex flex-col justify-between group select-none',
                isSelected
                  ? 'border-cyan-400 bg-cyan-950/40 shadow-neon'
                  : 'border-cyan-500/20 hover:border-cyan-500/50 bg-[#070e22]/80 hover:bg-[#091533]'
              )}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-500/30">
                    {getStrategyIcon(k)}
                  </span>
                  <span className="font-mono text-lg font-bold text-cyan-300">
                    {count.toLocaleString()}
                  </span>
                </div>
                <p className="font-mono text-xs font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                  {strat?.name || k}
                </p>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 font-sans leading-relaxed">
                  {strat?.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-cyan-500/10 flex items-center justify-between text-[10px] font-mono">
                <span className={cn('px-1.5 py-0.5 rounded border', strat?.badgeColor || 'border-cyan-500/30 text-cyan-300')}>
                  {isSelected ? 'ACTIVE FILTER' : 'SELECT'}
                </span>
                <span className="text-slate-500">
                  {adaptations.length > 0 ? ((count / adaptations.length) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Policy Enforcement & Execution Log Table */}
      <div className="glass-panel border border-cyan-500/20 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-3 bg-[#050a18]/60">
          <div>
            <h2 className="text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2 uppercase">
              <Shield className="w-4 h-4 text-cyan-400" />
              ADAPTIVE STRATEGY RESOLUTION & POLICY DECISION LOG
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Chronological ledger of deception strategies dynamically mapped from attacker intent by the Adaptive Engine
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-cyan-300 px-2.5 py-1 rounded bg-cyan-950/80 border border-cyan-500/30">
              {filteredAdaptations.length.toLocaleString()} RECORDS
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-cyan-500/20 bg-[#050a18]/80 text-[10px] font-mono text-cyan-300 uppercase tracking-widest">
                <th className="py-3 px-4">TIMESTAMP</th>
                <th className="py-3 px-4">SESSION ID</th>
                <th className="py-3 px-4">ATTACKER IP</th>
                <th className="py-3 px-4">ORIGIN</th>
                <th className="py-3 px-4">TRIGGERING INTENT</th>
                <th className="py-3 px-4">ASSIGNED STRATEGY</th>
                <th className="py-3 px-4">ACTION PROFILE</th>
                <th className="py-3 px-4 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-500/10 font-mono">
              {paginatedAdaptations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    No active deception policies match the search or filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedAdaptations.map((a) => {
                  const norm = normalizeIntent(a.intent);
                  const strat = strategies[a.strategy];

                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-cyan-950/20 transition-colors group text-slate-300"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-cyan-400/80 font-mono text-[11px]">
                        {formatTimestamp(a.timestamp)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono">
                          <Link
                            href={`/sessions/${a.session_id}`}
                            className="text-cyan-400 hover:text-cyan-300 hover:underline font-bold"
                          >
                            {a.session_id.slice(0, 8)}...
                          </Link>
                          <button
                            onClick={(e) => handleCopy(a.session_id, `sess-${a.id}`, e)}
                            className="text-slate-500 hover:text-cyan-300 transition-colors p-0.5"
                            title="Copy session ID"
                          >
                            {copiedKey === `sess-${a.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-slate-200">
                          <span>{a.attacker_ip}</span>
                          <button
                            onClick={(e) => handleCopy(a.attacker_ip, `ip-${a.id}`, e)}
                            className="text-slate-500 hover:text-cyan-300 transition-colors p-0.5"
                            title="Copy IP"
                          >
                            {copiedKey === `ip-${a.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                        {a.country}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border', getIntentColor(a.intent))}
                          title={norm.description}
                        >
                          {norm.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border font-semibold', strat?.badgeColor || 'border-cyan-500/30 text-cyan-300 bg-cyan-950/40')}>
                          {getStrategyIcon(a.strategy)}
                          {strat?.name || a.strategy.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-300 font-sans" title={a.action}>
                        {a.action}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
                          <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                          {a.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-cyan-500/20 bg-[#050a18]/70 flex items-center justify-between text-xs font-mono">
            <div className="text-slate-400">
              Showing {(currentPage - 1) * adaptationsPerPage + 1} to{' '}
              {Math.min(currentPage * adaptationsPerPage, filteredAdaptations.length)} of{' '}
              {filteredAdaptations.length} records
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-bold px-2">
                PAGE {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}