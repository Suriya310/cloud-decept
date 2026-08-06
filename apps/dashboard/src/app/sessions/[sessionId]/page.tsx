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
    threatIntel,
    fetchSession,
    fetchSessionCommands,
    fetchSessionThreatIntel,
    setSelectedSession,
  } = useDashboardStore();

  const [activeTab, setActiveTab] = useState<'commands' | 'threat-intel' | 'adaptations' | 'timeline'>('commands');
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedSession?.session_id !== sessionId) {
      fetchSession(sessionId);
      fetchSessionCommands(sessionId);
      fetchSessionThreatIntel(sessionId);
    }
  }, [sessionId, selectedSession?.session_id, fetchSession, fetchSessionCommands, fetchSessionThreatIntel]);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-4">
          <Link
            href="/sessions"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
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
                session.status === 'active'
                  ? 'bg-green-100 text-green-800 animate-pulse'
                  : 'bg-gray-100 text-gray-800'
              )}
            >
              {session.status.toUpperCase()}
            </span>
            <span
              className={cn(
                'px-3 py-1 rounded-full text-sm font-mono',
                session.threat_score >= 70 ? 'bg-red-100 text-red-800' :
                session.threat_score >= 40 ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              )}
            >
              Threat: {session.threat_score}/100
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Username</p>
                <p className="font-medium text-gray-900">{session.username || 'unknown'}</p>
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
                <p className="font-medium text-gray-900 font-mono text-sm">{session.src_ip}</p>
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
                <p className="text-sm text-gray-500">Commands</p>
                <p className="font-medium text-gray-900">{session.command_count}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="border-b border-gray-200">
            <nav className="flex gap-1 p-1" aria-label="Session tabs">
              {[
                { id: 'commands', label: 'Commands', count: commands.length },
                { id: 'threat-intel', label: 'Threat Intel', count: threatIntel ? 1 : 0 },
                { id: 'adaptations', label: 'Adaptations', count: 0 },
                { id: 'timeline', label: 'Timeline', count: 0 },
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
            {activeTab === 'commands' && (
              <div className="space-y-3">
                {commands.length === 0 ? (
                  <div className="text-center py-12">
                    <Terminal className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No commands recorded yet</p>
                  </div>
                ) : (
                  commands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className={cn(
                        'border border-gray-200 rounded-lg overflow-hidden',
                        expandedCommands.has(cmd.id) ? 'bg-gray-50' : ''
                      )}
                    >
                      <button
                        onClick={() => toggleCommand(cmd.id)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500 font-mono">
                            {new Date(cmd.timestamp).toLocaleTimeString()}
                          </span>
                          <span
                            className={cn(
                              'px-2 py-0.5 text-xs font-medium rounded',
                              cmd.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            )}
                          >
                            {cmd.success ? 'SUCCESS' : 'FAILED'}
                          </span>
                          {cmd.intent && (
                            <span className={cn('px-2 py-0.5 text-xs font-medium rounded', getIntentColor(cmd.intent))}>
                              {cmd.intent.replace(/_/g, ' ')}
                              {cmd.intent_confidence && (
                                <span className="ml-1 opacity-75">
                                  ({Math.round(cmd.intent_confidence * 100)}%)
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {expandedCommands.has(cmd.id) ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {expandedCommands.has(cmd.id) && (
                        <div className="border-t border-gray-200 p-4 bg-white">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Command</p>
                              <div className="bg-gray-900 text-green-300 p-3 rounded font-mono text-sm overflow-x-auto">
                                {cmd.command}
                              </div>
                              <button
                                onClick={() => copyToClipboard(cmd.command)}
                                className="mt-2 text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                Copy
                              </button>
                            </div>
                            {cmd.output && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Output</p>
                                <div className="bg-gray-900 text-gray-300 p-3 rounded font-mono text-sm overflow-x-auto max-h-64 overflow-y-auto">
                                  {cmd.output}
                                </div>
                                <button
                                  onClick={() => copyToClipboard(cmd.output ?? '')}
                                  className="mt-2 text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </button>
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
                  ))
                )}
              </div>
            )}

            {activeTab === 'threat-intel' && threatIntel && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="card p-4">
                    <p className="text-sm text-gray-500 mb-1">Primary Objective</p>
                    <p className="font-medium text-gray-900">{threatIntel.summary?.primary_objective || 'Unknown'}</p>
                  </div>
                  <div className="card p-4">
                    <p className="text-sm text-gray-500 mb-1">Skill Level</p>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-600 rounded-full"
                          style={{ width: `${(threatIntel.summary?.skill_level || 0) * 10}%` }}
                        />
                      </div>
                      <span className="font-mono text-lg font-bold text-gray-900">
                        {threatIntel.summary?.skill_level || 0}/10
                      </span>
                    </div>
                  </div>
                  <div className="card p-4">
                    <p className="text-sm text-gray-500 mb-1">Risk Level</p>
                    <span className={cn('badge text-sm', getRiskColor(threatIntel.summary?.risk_level || 'low'))}>
                      {threatIntel.summary?.risk_level || 'Unknown'}
                    </span>
                  </div>
                </div>

                {threatIntel.iocs && threatIntel.iocs.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Indicators of Compromise</h3>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Value</th>
                            <th>Context</th>
                            <th>Confidence</th>
                            <th>First Seen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {threatIntel.iocs.map((ioc, index) => (
                            <tr key={index}>
                              <td>
                                <span className="badge bg-blue-100 text-blue-800">{ioc.type}</span>
                              </td>
                              <td className="font-mono text-sm">{ioc.value}</td>
                              <td className="text-sm text-gray-600 max-w-xs truncate">{ioc.context}</td>
                              <td>
                                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary-600 rounded-full"
                                    style={{ width: `${ioc.confidence * 100}%` }}
                                  />
                                </div>
                              </td>
                              <td className="text-sm text-gray-500">{formatTimestamp(ioc.first_seen)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {threatIntel.techniques && threatIntel.techniques.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">MITRE ATT&CK Techniques</h3>
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Technique ID</th>
                            <th>Name</th>
                            <th>Tactic</th>
                            <th>Severity</th>
                            <th>Trigger</th>
                            <th>Confidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {threatIntel.techniques.map((tech, index) => (
                            <tr key={index}>
                              <td className="font-mono text-sm">{tech.technique_id}</td>
                              <td className="font-medium text-gray-900">{tech.name}</td>
                              <td>
                                <span className="badge bg-purple-100 text-purple-800">{tech.tactic}</span>
                              </td>
                              <td>
                                <span className={cn('badge', getSeverityColor(tech.severity))}>
                                  {tech.severity}
                                </span>
                              </td>
                              <td className="text-sm text-gray-600 max-w-xs truncate">{tech.trigger}</td>
                              <td>
                                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary-600 rounded-full"
                                    style={{ width: `${tech.confidence * 100}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {threatIntel.summary?.defensive_recommendations && threatIntel.summary.defensive_recommendations.length > 0 && (
                  <div className="card p-4 bg-green-50 border-green-200">
                    <h3 className="text-lg font-semibold text-green-800 mb-3 flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Defensive Recommendations
                    </h3>
                    <ul className="space-y-2">
                      {threatIntel.summary.defensive_recommendations.map((rec, index) => (
                        <li key={index} className="text-sm text-green-700 flex items-start gap-2">
                          <span className="text-green-500">→</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {threatIntel.summary?.narrative && (
                  <div className="card p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Session Narrative</h3>
                    <p className="text-gray-700 whitespace-pre-wrap">{threatIntel.summary.narrative}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Generated by {threatIntel.summary.model} at {formatTimestamp(threatIntel.summary.generated_at)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'threat-intel' && !threatIntel && (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No threat intelligence available for this session</p>
                <p className="text-sm text-gray-400 mt-1">Run threat analysis to populate this view</p>
              </div>
            )}

            {activeTab === 'adaptations' && (
              <div className="text-center py-12">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Adaptation history coming soon</p>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Timeline view coming soon</p>
              </div>
            )}
          </div>
        </div>
      </main>
  );
}