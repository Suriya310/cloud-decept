'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  MapPin,
  Clock,
  Terminal,
  User,
  Shield,
  Copy,
  Check,
  Key,
  ChevronDown,
  ChevronUp,
  FileText,
  Activity,
  Layers,
  Crosshair,
} from 'lucide-react';
import { cn, formatTimestamp, getIntentColor, formatDuration } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { getCountryName } from '@/lib/countries';
import { normalizeIntent } from '@/lib/intents';
import { evaluateThreat } from '@/lib/threatScore';
import { safeCopyToClipboard } from '@/lib/clipboard';

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const {
    selectedSession,
    commands,
    sessionAuth,
    threatIntel,
    fetchSession,
    fetchSessionCommands,
    fetchSessionAuth,
    fetchSessionThreatIntel,
  } = useDashboardStore();

  const [activeTab, setActiveTab] = useState<'timeline' | 'commands' | 'auth' | 'threat-intel'>('timeline');
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string | null | undefined, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!text) return;
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      fetchSession(sessionId);
      fetchSessionCommands(sessionId);
      fetchSessionAuth(sessionId);
      fetchSessionThreatIntel(sessionId);
    }
  }, [sessionId, fetchSession, fetchSessionCommands, fetchSessionAuth, fetchSessionThreatIntel]);

  const toggleCommand = (cmdId: string) => {
    setExpandedCommands((prev) => {
      const next = new Set(prev);
      if (next.has(cmdId)) {
        next.delete(cmdId);
      } else {
        next.add(cmdId);
      }
      return next;
    });
  };

  if (!selectedSession || selectedSession.session_id !== sessionId) {
    return (
      <div className="p-12 min-h-[60vh] flex items-center justify-center font-mono">
        <div className="glass-panel p-8 rounded-2xl text-center border border-cyan-500/30 max-w-md">
          <Activity className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-3" />
          <h2 className="text-base font-bold text-white uppercase tracking-wider">RETRIEVING FORENSIC SESSION...</h2>
          <p className="text-xs text-slate-400 mt-1">Indexing ClickHouse commands, auth records, and threat summary for {sessionId}</p>
        </div>
      </div>
    );
  }

  const session = selectedSession;
  const authEvents = sessionAuth ?? [];
  const commandsList = commands ?? [];
  const ip = session.src_ip ?? session.attacker_ip ?? 'unknown';
  const countryName = getCountryName(session.src_country || session.country);
  const threat = evaluateThreat(session.threat_score ?? session.skill_level);
  const primaryIntent = normalizeIntent(session.intent || (session.intent_history && session.intent_history[0]));

  // Threat Intel structure parsing
  const tiSummaryObj =
    typeof threatIntel?.summary === 'object' && threatIntel?.summary !== null
      ? threatIntel.summary
      : null;
  const tiNarrative =
    typeof threatIntel?.summary === 'string'
      ? threatIntel.summary
      : tiSummaryObj?.narrative || (tiSummaryObj as any)?.summary || '';
  const tiTechniques =
    threatIntel?.techniques ||
    (tiSummaryObj as any)?.mitre_techniques?.map((t: string) => ({
      technique_id: t,
      name: t,
      tactic: 'Adversary Technique',
      severity: 'medium',
      confidence: 0.9,
    })) ||
    [];
  const tiIOCs =
    threatIntel?.iocs ||
    (tiSummaryObj as any)?.iocs?.map((ioc: string) => ({
      type: 'IOC',
      value: ioc,
      context: 'Session payload extraction',
      confidence: 0.9,
    })) ||
    [];

  return (
    <div className="space-y-6 font-mono">
      {/* Console Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-cyan-500/15">
        <div className="flex items-center gap-3">
          <Link
            href="/sessions"
            className="p-2 rounded-lg bg-[#070e22] border border-cyan-500/25 text-slate-300 hover:text-cyan-300 hover:border-cyan-400 transition-all"
            aria-label="Back to session matrix"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-cyan-400" />
              <span>FORENSIC INVESTIGATION CONSOLE</span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <span>ID:</span>
              <span className="font-bold text-cyan-300">{session.session_id}</span>
              <button
                onClick={() => handleCopy(session.session_id, 'sess-id')}
                className="text-slate-500 hover:text-cyan-300"
                title="Copy session ID"
              >
                {copiedKey === 'sess-id' ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-bold border uppercase',
              (session.status ?? 'closed') === 'active'
                ? 'text-emerald-400 bg-emerald-950/80 border-emerald-500/40 animate-pulse'
                : 'text-slate-300 bg-slate-900 border-slate-700/50'
            )}
          >
            {(session.status ?? 'closed')}
          </span>
          <span
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-bold border uppercase',
              threat.badgeClass
            )}
            title={threat.description}
          >
            {threat.label}
          </span>
        </div>
      </div>

      {/* Primary Metadata HUD Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        {/* Attacker IP */}
        <div className="glass-panel p-3.5 rounded-xl border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">ATTACKER IP</span>
          <div className="flex items-center gap-1.5 font-bold text-white text-sm truncate">
            <span>{ip}</span>
            <button
              onClick={() => handleCopy(ip, 'ip-main')}
              className="text-slate-500 hover:text-cyan-300"
              title="Copy IP"
            >
              {copiedKey === 'ip-main' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <span className="text-[10px] text-cyan-400/80 block mt-0.5 truncate">{countryName}</span>
        </div>

        {/* Username */}
        <div className="glass-panel p-3.5 rounded-xl border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">USERNAME PROBED</span>
          <span className="font-bold text-white text-sm block truncate">
            {session.username || authEvents[0]?.username || 'None / Direct'}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Auth: {session.auth_success ? 'Granted' : authEvents.length > 0 ? 'Failed' : 'N/A'}
          </span>
        </div>

        {/* Duration */}
        <div className="glass-panel p-3.5 rounded-xl border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">DURATION</span>
          <span className="font-bold text-teal-300 text-sm block">
            {session.duration_seconds && session.duration_seconds > 0
              ? formatDuration(session.duration_seconds)
              : session.status === 'active'
              ? 'Active in-flight'
              : '< 1s Probe'}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {formatTimestamp(session.start_time)}
          </span>
        </div>

        {/* Commands Captured */}
        <div className="glass-panel p-3.5 rounded-xl border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">COMMANDS</span>
          <span className="font-bold text-white text-sm block">
            {(commandsList.length || session.command_count || 0).toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Recorded in session</span>
        </div>

        {/* Auth Attempts */}
        <div className="glass-panel p-3.5 rounded-xl border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">AUTH PROBES</span>
          <span className="font-bold text-amber-300 text-sm block">
            {authEvents.length}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Credentials tested</span>
        </div>

        {/* Objective */}
        <div className="glass-panel p-3.5 rounded-xl border border-cyan-500/20">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">MITRE OBJECTIVE</span>
          <span className="font-bold text-cyan-300 text-xs block truncate" title={primaryIntent.label}>
            {primaryIntent.label}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Classifier output</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-cyan-500/20 shadow-2xl">
        <div className="border-b border-cyan-500/15 bg-[#050a18]">
          <nav className="flex gap-2 p-2" aria-label="Investigation tabs">
            {[
              { id: 'timeline', label: 'EVENT TIMELINE', count: commandsList.length + authEvents.length },
              { id: 'commands', label: 'CAPTURED COMMANDS', count: commandsList.length },
              { id: 'auth', label: 'AUTH ATTEMPTS', count: authEvents.length },
              { id: 'threat-intel', label: 'MITRE & THREAT INTEL', count: tiTechniques.length + (tiNarrative ? 1 : 0) },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all',
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm shadow-cyan-950'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                )}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={cn(
                      'px-1.5 py-0.2 rounded text-[10px] font-mono',
                      activeTab === tab.id
                        ? 'bg-cyan-400/30 text-cyan-200'
                        : 'bg-slate-800 text-slate-500'
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab 1: Chronological Event Timeline */}
        {activeTab === 'timeline' && (
          <div className="p-6">
            {commandsList.length === 0 && authEvents.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                <Clock className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p>No chronological events captured for this session.</p>
              </div>
            ) : (
              <div className="relative border-l border-cyan-500/30 ml-4 space-y-6 py-2">
                {/* Session Start */}
                <div className="relative pl-6">
                  <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white uppercase">SESSION INITIALIZED</span>
                    <span className="text-[11px] text-slate-500">{formatTimestamp(session.start_time)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Connection established from <span className="text-cyan-300 font-bold">{ip}</span> ({countryName}) on SSH port 2222
                  </p>
                </div>

                {/* Auth attempts */}
                {authEvents.map((auth, idx) => (
                  <div key={`auth-ev-${idx}`} className="relative pl-6">
                    <div
                      className={cn(
                        'absolute -left-1.5 top-1 w-3 h-3 rounded-full',
                        auth.success ? 'bg-emerald-400' : 'bg-rose-500 shadow-sm shadow-rose-500'
                      )}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white">
                        AUTHENTICATION ATTEMPT: <span className="text-amber-300">{auth.username || 'unknown'}</span>
                      </span>
                      <span className="text-[11px] text-slate-500">{formatTimestamp(auth.timestamp)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Result: <span className={cn('font-bold', auth.success ? 'text-emerald-400' : 'text-rose-400')}>{auth.success ? 'ACCEPTED' : 'REJECTED'}</span>
                    </p>
                  </div>
                ))}

                {/* Commands */}
                {commandsList.map((cmd, idx) => {
                  const norm = normalizeIntent(cmd.intent);
                  return (
                    <div key={`cmd-ev-${idx}`} className="relative pl-6">
                      <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-400 font-mono">
                          $ {cmd.command}
                        </span>
                        <span className="text-[11px] text-slate-500">{formatTimestamp(cmd.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn('badge text-[10px]', norm.badgeClass)}>
                          {norm.label}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Session End */}
                {session.end_time && !session.end_time.startsWith('1970') && (
                  <div className="relative pl-6">
                    <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-slate-500" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-400 uppercase">SESSION TERMINATED</span>
                      <span className="text-[11px] text-slate-500">{formatTimestamp(session.end_time)}</span>
                    </div>
                    {session.disconnection_reason && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Disconnection Reason: {session.disconnection_reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Captured Commands */}
        {activeTab === 'commands' && (
          <div className="p-4 space-y-3">
            {commandsList.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                <Terminal className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p>No commands captured in this session.</p>
              </div>
            ) : (
              commandsList.map((cmd, idx) => {
                const cmdKey = cmd.event_id || cmd.id || `cmd-${idx}`;
                const isExpanded = expandedCommands.has(cmdKey);
                const norm = normalizeIntent(cmd.intent);

                return (
                  <div
                    key={cmdKey}
                    className="border border-cyan-500/15 rounded-xl overflow-hidden bg-[#070e22]/90 hover:border-cyan-400/30 transition-colors"
                  >
                    <div
                      onClick={() => toggleCommand(cmdKey)}
                      className="p-3 bg-[#050a18] flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs text-slate-500 w-5">#{idx + 1}</span>
                        <code className="text-xs font-bold text-emerald-400 truncate">
                          {cmd.command}
                        </code>
                        <button
                          onClick={(e) => handleCopy(cmd.command, `cmd-${cmdKey}`, e)}
                          className="text-slate-500 hover:text-cyan-300 p-0.5"
                          title="Copy command"
                        >
                          {copiedKey === `cmd-${cmdKey}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                        <span className={cn('badge text-[10px]', norm.badgeClass)}>
                          {norm.label}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {cmd.timestamp ? formatTimestamp(cmd.timestamp) : ''}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 bg-black/60 border-t border-cyan-500/15 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] text-cyan-400/80 uppercase tracking-wider">
                            DECEPTION SYSTEM RESPONSE:
                          </span>
                          {cmd.output && (
                            <button
                              onClick={() => handleCopy(cmd.output, `out-${cmdKey}`)}
                              className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1"
                            >
                              {copiedKey === `out-${cmdKey}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              Copy output
                            </button>
                          )}
                        </div>
                        <pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap max-h-56 overflow-y-auto p-3 bg-[#030611] rounded-lg border border-slate-800">
                          {cmd.output || '(No stdout/stderr captured)'}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 3: Auth Attempts */}
        {activeTab === 'auth' && (
          <div className="p-4">
            {authEvents.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                <Key className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p>No authentication attempts logged for this session.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Username</th>
                      <th>Password / Secret Probed</th>
                      <th>Auth Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authEvents.map((auth, idx) => (
                      <tr key={idx}>
                        <td className="text-slate-400 whitespace-nowrap">
                          {auth.timestamp ? formatTimestamp(auth.timestamp) : '—'}
                        </td>
                        <td className="font-bold text-white">
                          {auth.username || 'unknown'}
                        </td>
                        <td className="text-slate-300">
                          {auth.password ? (
                            <div className="flex items-center gap-2">
                              <span>{auth.password}</span>
                              <button
                                onClick={() => handleCopy(auth.password, `pwd-${idx}`)}
                                className="text-slate-500 hover:text-cyan-300"
                                title="Copy credential"
                              >
                                {copiedKey === `pwd-${idx}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={cn(
                              'badge text-[10px] font-bold',
                              auth.success
                                ? 'text-emerald-400 bg-emerald-950/80 border-emerald-500/40'
                                : 'text-rose-400 bg-rose-950/80 border-rose-500/40'
                            )}
                          >
                            {auth.success ? 'ACCEPTED' : 'REJECTED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Threat Intel & MITRE */}
        {activeTab === 'threat-intel' && (
          <div className="p-6 space-y-6">
            <div className="p-4 bg-[#070e22] border border-cyan-500/20 rounded-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 mb-2">
                AUTOMATED ADVERSARY SUMMARY
              </h3>
              {tiNarrative ? (
                <p className="text-xs text-slate-300 leading-relaxed">{tiNarrative}</p>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  {primaryIntent.isUnclassified
                    ? 'Activity classified as unclassified probe scanning. No high-risk cloud exploitation sequences detected.'
                    : `Session demonstrated attack patterns consistent with ${primaryIntent.label}.`}
                </p>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                CORRELATED MITRE ATT&CK TECHNIQUES
              </h3>
              {tiTechniques.length === 0 ? (
                <p className="text-xs text-slate-500">No specific MITRE techniques identified for this session.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tiTechniques.map((tech: any, idx: number) => (
                    <div key={idx} className="p-3 bg-[#070e22] border border-cyan-500/20 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-400 text-xs">{tech.technique_id}</span>
                        <span className="badge text-[9px] bg-slate-800 text-slate-400">
                          {tech.tactic || 'Technique'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-white mt-1">{tech.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                EXTRACTED INDICATORS OF COMPROMISE (IOCS)
              </h3>
              {tiIOCs.length === 0 ? (
                <p className="text-xs text-slate-500">No external IOC artifacts captured.</p>
              ) : (
                <div className="space-y-2">
                  {tiIOCs.map((ioc: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-[#070e22] border border-cyan-500/20 rounded-lg flex items-center justify-between">
                      <span className="text-xs font-mono text-cyan-300 truncate max-w-md">{ioc.value}</span>
                      <span className="badge text-[9px] bg-purple-950 text-purple-300 border-purple-500/30">
                        {ioc.type || 'IOC'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}