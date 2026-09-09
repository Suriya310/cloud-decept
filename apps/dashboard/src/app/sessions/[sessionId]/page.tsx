'use client';

import { cn, formatTimestamp, getIntentColor, getRiskColor, getSeverityColor, formatDuration } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  AlertTriangle,
  MapPin,
  Clock,
  Terminal,
  User,
  Shield,
  Download,
  Copy,
  Check,
  Key,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';

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

  useEffect(() => {
    fetchSession(sessionId);
    fetchSessionCommands(sessionId);
    fetchSessionAuth(sessionId);
    fetchSessionThreatIntel(sessionId);
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

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!selectedSession || selectedSession.session_id !== sessionId) {
    return (
      <main className="p-6 min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Loading session...</h2>
          <p className="text-gray-500 mt-2">Fetching session details from backend</p>
        </div>
      </main>
    );
  }

  const session = selectedSession;
  const authEvents = sessionAuth ?? [];
  const commandsList = commands ?? [];

  // Parse threat intel narrative & fields defensively (handles both AI & summary tables)
  const tiSummaryObj = typeof threatIntel?.summary === 'object' && threatIntel?.summary !== null ? threatIntel.summary : null;
  const tiNarrative = typeof threatIntel?.summary === 'string'
    ? threatIntel.summary
    : (tiSummaryObj?.narrative || (tiSummaryObj as any)?.summary || '');
  const tiSkillLevel = tiSummaryObj?.skill_level ?? (session.threat_score ? Math.min(Math.round(session.threat_score / 10), 10) : 0);
  const tiObjective = tiSummaryObj?.primary_objective || (tiSummaryObj as any)?.intent || session.intent || 'Unknown';
  const tiRiskLevel = tiSummaryObj?.risk_level || ((session.threat_score ?? 0) >= 70 ? 'critical' : (session.threat_score ?? 0) >= 40 ? 'high' : 'medium');
  const tiTechniques = threatIntel?.techniques || (tiSummaryObj as any)?.mitre_techniques?.map((t: string) => ({ technique_id: t, name: t, tactic: 'General', severity: 'medium', trigger: '', confidence: 0.9 })) || [];
  const tiIOCs = threatIntel?.iocs || (tiSummaryObj as any)?.iocs?.map((ioc: string) => ({ type: 'IOC', value: ioc, context: 'Extracted from session', confidence: 0.9, first_seen: session.start_time })) || [];

  return (
    <main className="p-6 space-y-6">
      {/* Navigation & Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/sessions"
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Back to sessions"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Session Details</h1>
          <p className="text-gray-500 mt-1 font-mono text-sm">{session.session_id}</p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium',
              (session.status ?? 'closed') === 'active'
                ? 'bg-green-100 text-green-800 animate-pulse'
                : 'bg-gray-100 text-gray-800'
            )}
          >
            {(session.status ?? 'closed').toUpperCase()}
          </span>
          <span
            className={cn(
              'px-3 py-1 rounded-full text-sm font-mono',
              (session.threat_score ?? 0) >= 70 ? 'bg-red-100 text-red-800' :
              (session.threat_score ?? 0) >= 40 ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            )}
          >
            Threat: {(session.threat_score ?? 0)}/100
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Username</p>
              <p className="font-medium text-gray-900">{session.username || (authEvents[0]?.username) || 'unknown'}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Attacker IP</p>
              <p className="font-medium text-gray-900 font-mono text-sm">{session.src_ip ?? session.attacker_ip ?? 'unknown'}</p>
              {session.src_country && (
                <p className="text-xs text-gray-500 mt-0.5">Country: {session.src_country}</p>
              )}
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Duration</p>
              <p className="font-medium text-gray-900">
                {session.duration_seconds ? formatDuration(session.duration_seconds) : 'Active'}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Terminal className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Commands Captured</p>
              <p className="font-medium text-gray-900">{commandsList.length || session.command_count || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 p-1" aria-label="Session tabs">
            {[
              { id: 'commands', label: 'Commands', count: commandsList.length },
              { id: 'auth', label: 'Auth Attempts', count: authEvents.length },
              { id: 'threat-intel', label: 'Threat Intel', count: threatIntel || session.intent ? 1 : 0 },
              { id: 'timeline', label: 'Timeline', count: commandsList.length + authEvents.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-4">
          {/* Commands Tab */}
          {activeTab === 'commands' && (
            <div className="space-y-3">
              {commandsList.length === 0 ? (
                <div className="text-center py-12">
                  <Terminal className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No commands recorded for this session</p>
                </div>
              ) : (
                commandsList.map((cmd, index) => {
                  const cmdKey = cmd.event_id || cmd.id || `cmd-${index}`;
                  const isExpanded = expandedCommands.has(cmdKey);
                  return (
                    <div
                      key={cmdKey}
                      className={cn(
                        'border border-gray-200 rounded-lg overflow-hidden transition-colors',
                        isExpanded ? 'bg-gray-50' : ''
                      )}
                    >
                      <button
                        onClick={() => toggleCommand(cmdKey)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500 font-mono">
                            {cmd.timestamp ? new Date(cmd.timestamp).toLocaleTimeString() : '—'}
                          </span>
                          <span
                            className={cn(
                              'px-2 py-0.5 text-xs font-medium rounded',
                              cmd.success || cmd.exit_code === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            )}
                          >
                            {cmd.success || cmd.exit_code === 0 ? 'SUCCESS' : 'FAILED'}
                          </span>
                          <code className="text-sm font-mono text-gray-900 truncate max-w-md">
                            {cmd.command}
                          </code>
                          {cmd.intent && (
                            <span className={cn('px-2 py-0.5 text-xs font-medium rounded', getIntentColor(cmd.intent))}>
                              {cmd.intent.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4 bg-white">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Command</p>
                                <button
                                  onClick={() => copyToClipboard(cmd.command, `cmd-${cmdKey}`)}
                                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                >
                                  {copiedKey === `cmd-${cmdKey}` ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                                  {copiedKey === `cmd-${cmdKey}` ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <div className="bg-gray-900 text-green-300 p-3 rounded font-mono text-sm overflow-x-auto">
                                {cmd.command}
                              </div>
                            </div>
                            {cmd.output && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Output</p>
                                  <button
                                    onClick={() => copyToClipboard(cmd.output ?? '', `out-${cmdKey}`)}
                                    className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                  >
                                    {copiedKey === `out-${cmdKey}` ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                                    {copiedKey === `out-${cmdKey}` ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                                <div className="bg-gray-900 text-gray-300 p-3 rounded font-mono text-sm overflow-x-auto max-h-64 overflow-y-auto">
                                  {cmd.output}
                                </div>
                              </div>
                            )}
                          </div>
                          {cmd.mitre_techniques && cmd.mitre_techniques.length > 0 && (
                            <div className="mt-4">
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">MITRE ATT&CK Techniques</p>
                              <div className="flex flex-wrap gap-2">
                                {cmd.mitre_techniques.map((tech: string) => (
                                  <span key={tech} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded font-mono">
                                    {tech}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Auth Attempts Tab */}
          {activeTab === 'auth' && (
            <div className="space-y-4">
              {authEvents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p>No authentication attempts captured for this session</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Username</th>
                        <th>Password</th>
                        <th>Method</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authEvents.map((auth, index) => (
                        <tr key={auth.event_id || auth.id || index}>
                          <td className="text-sm font-mono text-gray-500">{formatTimestamp(auth.timestamp)}</td>
                          <td className="font-mono text-sm font-semibold text-gray-900">{auth.username}</td>
                          <td className="font-mono text-sm text-gray-600">
                            {auth.password ? (
                              <code className="bg-gray-100 px-2 py-0.5 rounded">{auth.password}</code>
                            ) : (
                              <span className="text-gray-400 italic">empty</span>
                            )}
                          </td>
                          <td className="text-sm text-gray-500">{auth.auth_method || 'password'}</td>
                          <td>
                            <span
                              className={cn(
                                'badge',
                                auth.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              )}
                            >
                              {auth.success ? 'Accepted' : 'Failed'}
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

          {/* Threat Intel Tab */}
          {activeTab === 'threat-intel' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-4">
                  <p className="text-sm text-gray-500 mb-1">Primary Objective</p>
                  <p className="font-medium text-gray-900 capitalize">{tiObjective.replace(/_/g, ' ')}</p>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-gray-500 mb-1">Assessed Skill Level</p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-600 rounded-full"
                        style={{ width: `${tiSkillLevel * 10}%` }}
                      />
                    </div>
                    <span className="font-mono text-lg font-bold text-gray-900">
                      {tiSkillLevel}/10
                    </span>
                  </div>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-gray-500 mb-1">Assessed Risk Level</p>
                  <span className={cn('badge text-sm', getRiskColor(tiRiskLevel))}>
                    {tiRiskLevel.toUpperCase()}
                  </span>
                </div>
              </div>

              {tiNarrative && (
                <div className="card p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Session Intelligence Summary</h3>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{tiNarrative}</p>
                </div>
              )}

              {tiIOCs.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Extracted Indicators (IOCs)</h3>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Value</th>
                          <th>Context</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiIOCs.map((ioc: any, index: number) => (
                          <tr key={index}>
                            <td><span className="badge bg-blue-100 text-blue-800">{ioc.type}</span></td>
                            <td className="font-mono text-sm">{ioc.value}</td>
                            <td className="text-sm text-gray-600">{ioc.context}</td>
                            <td>
                              <span className="font-mono text-xs">{Math.round((ioc.confidence || 1) * 100)}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tiTechniques.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">MITRE ATT&CK Techniques</h3>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Technique ID</th>
                          <th>Name</th>
                          <th>Tactic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiTechniques.map((tech: any, index: number) => (
                          <tr key={index}>
                            <td className="font-mono text-sm font-semibold">{tech.technique_id}</td>
                            <td className="font-medium text-gray-900">{tech.name || tech.technique_id}</td>
                            <td><span className="badge bg-purple-100 text-purple-800">{tech.tactic || 'Discovery'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {commandsList.length === 0 && authEvents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p>No timeline events recorded yet</p>
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">
                  {/* Start session item */}
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
                    <p className="text-xs text-gray-500 font-mono">{formatTimestamp(session.start_time)}</p>
                    <p className="text-sm font-medium text-gray-900">Session Started</p>
                    <p className="text-xs text-gray-500">Attacker {session.src_ip || session.attacker_ip} connected via SSH</p>
                  </div>

                  {/* Interleaved events */}
                  {([
                    ...authEvents.map(a => ({ type: 'auth' as const, time: a.timestamp, data: a })),
                    ...commandsList.map(c => ({ type: 'cmd' as const, time: c.timestamp, data: c })),
                  ] as Array<{ type: 'auth'; time: string; data: typeof authEvents[0] } | { type: 'cmd'; time: string; data: typeof commandsList[0] }>)
                    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
                    .map((item, idx) => (
                      <div key={idx} className="relative">
                        <div className={cn(
                          'absolute -left-[31px] top-0 w-4 h-4 rounded-full border-2 border-white',
                          item.type === 'auth' ? (item.data.success ? 'bg-green-500' : 'bg-red-500') : 'bg-orange-500'
                        )} />
                        <p className="text-xs text-gray-500 font-mono">{formatTimestamp(item.time)}</p>
                        {item.type === 'auth' ? (
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              Auth Attempt ({item.data.username} / {item.data.password || 'empty'})
                            </p>
                            <span className={cn('badge text-xs mt-1', item.data.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                              {item.data.success ? 'Success' : 'Failed'}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <code className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                              {item.data.command}
                            </code>
                            {item.data.intent && (
                              <span className={cn('badge text-xs ml-2', getIntentColor(item.data.intent))}>
                                {item.data.intent}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}