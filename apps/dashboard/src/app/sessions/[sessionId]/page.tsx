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
  Sparkles,
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
    connectionStatus,
  } = useDashboardStore();

  const [activeTab, setActiveTab] = useState<'commands' | 'auth' | 'threat-intel' | 'timeline'>('commands');
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
      <main className="p-6 min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-8">
          <Activity className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">Loading session telemetry...</h2>
          <p className="text-sm text-gray-500 mt-1">Retrieving authoritative records for {sessionId}</p>
        </div>
      </main>
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
      tactic: 'Attack Pattern',
      severity: 'medium',
      trigger: '',
      confidence: 0.9,
    })) ||
    [];
  const tiIOCs =
    threatIntel?.iocs ||
    (tiSummaryObj as any)?.iocs?.map((ioc: string) => ({
      type: 'IOC',
      value: ioc,
      context: 'Captured in session',
      confidence: 0.9,
      first_seen: session.start_time,
    })) ||
    [];

  return (
    <main className="p-6 space-y-6">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/sessions"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Back to sessions list"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span>Session Details</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs text-gray-500">{session.session_id}</span>
              <button
                onClick={() => handleCopy(session.session_id, 'header-sess-id')}
                className="text-gray-400 hover:text-gray-600 p-0.5"
                title="Copy full session ID"
              >
                {copiedKey === 'header-sess-id' ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold uppercase',
              (session.status ?? 'closed') === 'active'
                ? 'bg-green-100 text-green-800 animate-pulse'
                : 'bg-gray-100 text-gray-800'
            )}
          >
            {(session.status ?? 'closed')}
          </span>
          <span
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold',
              threat.badgeBg,
              threat.badgeColor
            )}
            title={threat.description}
          >
            Threat: {threat.label}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attacker IP */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <MapPin className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Attacker IP</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono font-bold text-gray-900 text-sm truncate">{ip}</span>
                <button
                  onClick={() => handleCopy(ip, 'card-ip')}
                  className="text-gray-400 hover:text-gray-600 p-0.5"
                  title="Copy IP"
                >
                  {copiedKey === 'card-ip' ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{countryName}</p>
            </div>
          </div>
        </div>

        {/* Username / Credentials */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Username Probed</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {session.username || authEvents[0]?.username || 'None / Unknown'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Auth: {session.auth_success ? 'Granted' : authEvents.length > 0 ? 'Failed' : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Duration</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {session.duration_seconds && session.duration_seconds > 0
                  ? formatDuration(session.duration_seconds)
                  : session.status === 'active'
                  ? 'Active now'
                  : 'Instant / < 1s'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Started: {formatTimestamp(session.start_time)}
              </p>
            </div>
          </div>
        </div>

        {/* Commands & Activity */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Terminal className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Commands</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {commandsList.length || session.command_count || 0} executed
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Objective: {primaryIntent.label}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="flex gap-2 p-2" aria-label="Session navigation tabs">
            {[
              { id: 'commands', label: 'Commands', count: commandsList.length },
              { id: 'auth', label: 'Auth Attempts', count: authEvents.length },
              { id: 'threat-intel', label: 'Threat Intel & MITRE', count: tiTechniques.length + (tiNarrative ? 1 : 0) },
              { id: 'timeline', label: 'Event Timeline', count: commandsList.length + authEvents.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs',
                      activeTab === tab.id
                        ? 'bg-primary-200 text-primary-800'
                        : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab 1: Commands */}
        {activeTab === 'commands' && (
          <div className="p-4">
            {commandsList.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Terminal className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-600">No commands captured in this session</p>
                <p className="text-xs text-gray-400 mt-1">Session disconnected before command execution or only auth probed</p>
              </div>
            ) : (
              <div className="space-y-3">
                {commandsList.map((cmd, idx) => {
                  const cmdKey = cmd.event_id || cmd.id || `cmd-${idx}`;
                  const isExpanded = expandedCommands.has(cmdKey);
                  const normIntent = normalizeIntent(cmd.intent);

                  return (
                    <div
                      key={cmdKey}
                      className="border border-gray-200 rounded-lg overflow-hidden transition-colors hover:border-gray-300"
                    >
                      <div
                        onClick={() => toggleCommand(cmdKey)}
                        className="p-3 bg-gray-50 flex items-center justify-between gap-3 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-gray-400 font-mono w-6">#{idx + 1}</span>
                          <span className="font-mono text-sm font-semibold text-gray-900 truncate">
                            {cmd.command}
                          </span>
                          <button
                            onClick={(e) => handleCopy(cmd.command, `cmd-${cmdKey}`, e)}
                            className="text-gray-400 hover:text-gray-600 p-0.5"
                            title="Copy command"
                          >
                            {copiedKey === `cmd-${cmdKey}` ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span
                            className={cn('badge text-xs', getIntentColor(cmd.intent || ''))}
                            title={normIntent.description}
                          >
                            {normIntent.label}
                          </span>
                          <span className="text-xs text-gray-500 font-mono">
                            {cmd.timestamp ? formatTimestamp(cmd.timestamp) : ''}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 bg-gray-950 border-t border-gray-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-400 font-mono">Simulated Honeypot Output:</span>
                            {cmd.output && (
                              <button
                                onClick={() => handleCopy(cmd.output, `out-${cmdKey}`)}
                                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                              >
                                {copiedKey === `out-${cmdKey}` ? (
                                  <Check className="w-3 h-3 text-green-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                Copy output
                              </button>
                            )}
                          </div>
                          <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {cmd.output || '(No command output recorded)'}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Auth Attempts */}
        {activeTab === 'auth' && (
          <div className="p-4">
            {authEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Key className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-600">No authentication attempts recorded</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Username</th>
                      <th>Password / Key</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authEvents.map((auth, idx) => (
                      <tr key={idx}>
                        <td className="text-xs text-gray-500 whitespace-nowrap">
                          {auth.timestamp ? formatTimestamp(auth.timestamp) : '—'}
                        </td>
                        <td className="font-mono text-xs font-semibold text-gray-900">
                          {auth.username || 'unknown'}
                        </td>
                        <td className="font-mono text-xs text-gray-600">
                          {auth.password ? (
                            <div className="flex items-center gap-1.5">
                              <span>{auth.password}</span>
                              <button
                                onClick={() => handleCopy(auth.password, `pwd-${idx}`)}
                                className="text-gray-400 hover:text-gray-600 p-0.5"
                                title="Copy credential"
                              >
                                {copiedKey === `pwd-${idx}` ? (
                                  <Check className="w-3 h-3 text-green-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={cn(
                              'badge text-xs',
                              auth.success
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            )}
                          >
                            {auth.success ? 'Success' : 'Failed'}
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

        {/* Tab 3: Threat Intel */}
        {activeTab === 'threat-intel' && (
          <div className="p-6 space-y-6">
            {/* Assessment Card */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Automated Threat Summary</h3>
              {tiNarrative ? (
                <p className="text-sm text-gray-700 leading-relaxed">{tiNarrative}</p>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  {primaryIntent.isUnclassified
                    ? 'Activity classified as unclassified probe scanning. No high-risk cloud exploitation sequences detected.'
                    : `Session exhibited indicators matching ${primaryIntent.label}. Automated MITRE telemetry recorded.`}
                </p>
              )}
            </div>

            {/* MITRE ATT&CK Techniques */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary-600" />
                MITRE ATT&CK Techniques Correlated
              </h3>
              {tiTechniques.length === 0 ? (
                <p className="text-xs text-gray-500">No specific MITRE ATT&CK techniques identified for this session.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tiTechniques.map((tech: any, idx: number) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded-lg bg-white">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-primary-700">
                          {tech.technique_id}
                        </span>
                        <span className="badge text-[10px] bg-gray-100 text-gray-700">
                          {tech.tactic || 'Technique'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mt-1">{tech.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Indicators of Compromise */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
                Indicators of Compromise (IOCs)
              </h3>
              {tiIOCs.length === 0 ? (
                <p className="text-xs text-gray-500">No external IOC artifacts captured.</p>
              ) : (
                <div className="space-y-2">
                  {tiIOCs.map((ioc: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-gray-50 border border-gray-200 rounded flex items-center justify-between">
                      <div className="font-mono text-xs text-gray-800 truncate max-w-md">
                        {ioc.value}
                      </div>
                      <span className="badge text-[10px] bg-purple-100 text-purple-800">
                        {ioc.type || 'IOC'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Chronological Timeline */}
        {activeTab === 'timeline' && (
          <div className="p-6">
            {commandsList.length === 0 && authEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Clock className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-600">No chronological events logged</p>
              </div>
            ) : (
              <div className="relative border-l border-gray-200 ml-4 space-y-6 py-2">
                {/* Session Start */}
                <div className="relative pl-6">
                  <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
                  <p className="text-xs font-bold text-gray-900">Session Opened</p>
                  <p className="text-[11px] text-gray-500">{formatTimestamp(session.start_time)}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Attacker connected from {ip} ({countryName})
                  </p>
                </div>

                {/* Auth attempts */}
                {authEvents.map((auth, idx) => (
                  <div key={`auth-ev-${idx}`} className="relative pl-6">
                    <div
                      className={cn(
                        'absolute -left-2 top-1 w-4 h-4 rounded-full border-2 border-white',
                        auth.success ? 'bg-green-500' : 'bg-red-400'
                      )}
                    />
                    <p className="text-xs font-bold text-gray-900">
                      Auth Attempt: {auth.username || 'unknown'}
                    </p>
                    <p className="text-[11px] text-gray-500">{formatTimestamp(auth.timestamp)}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Result: {auth.success ? 'Accepted' : 'Rejected'}
                    </p>
                  </div>
                ))}

                {/* Commands */}
                {commandsList.map((cmd, idx) => (
                  <div key={`cmd-ev-${idx}`} className="relative pl-6">
                    <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-primary-500 border-2 border-white" />
                    <p className="font-mono text-xs font-bold text-gray-900">
                      {cmd.command}
                    </p>
                    <p className="text-[11px] text-gray-500">{formatTimestamp(cmd.timestamp)}</p>
                    {cmd.intent && (
                      <span className={cn('badge text-[10px] mt-1', getIntentColor(cmd.intent))}>
                        {normalizeIntent(cmd.intent).label}
                      </span>
                    )}
                  </div>
                ))}

                {/* Session End */}
                {session.end_time && !session.end_time.startsWith('1970') && (
                  <div className="relative pl-6">
                    <div className="absolute -left-2 top-1 w-4 h-4 rounded-full bg-gray-500 border-2 border-white" />
                    <p className="text-xs font-bold text-gray-900">Session Closed</p>
                    <p className="text-[11px] text-gray-500">{formatTimestamp(session.end_time)}</p>
                    {session.disconnection_reason && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        Reason: {session.disconnection_reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}