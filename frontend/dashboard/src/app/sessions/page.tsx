'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { format, formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Terminal,
  Shield,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Session {
  id: string;
  start_time: string;
  end_time?: string;
  duration: number;
  commands_count: number;
  attacker_ip: string;
  attacker_country: string;
  attacker_asn?: string;
  intent: string;
  skill_level: number;
  confidence: number;
  status: 'active' | 'completed';
  cloud_provider: string;
  commands: Array<{
    timestamp: string;
    command: string;
    output?: string;
    intent?: string;
  }>;
}

export default function SessionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('start_time');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Mock data - in production from ClickHouse
  const sessions: Session[] = [
    {
      id: 'sess_001',
      start_time: '2024-01-15T10:23:45Z',
      end_time: '2024-01-15T10:30:45Z',
      duration: 420,
      commands_count: 23,
      attacker_ip: '203.0.113.45',
      attacker_country: 'China',
      attacker_asn: 'AS4134 CHINANET-BACKBONE',
      intent: 'cloud_recon',
      skill_level: 7,
      confidence: 0.92,
      status: 'completed',
      cloud_provider: 'aws',
      commands: [
        { timestamp: '10:23:47', command: 'whoami' },
        { timestamp: '10:23:50', command: 'uname -a' },
        { timestamp: '10:24:05', command: 'aws ec2 describe-instances' },
        { timestamp: '10:24:30', command: 'aws s3 ls' },
        { timestamp: '10:25:10', command: 'aws iam list-users' },
        { timestamp: '10:26:00', command: 'aws ec2 describe-vpcs' },
      ]
    },
    {
      id: 'sess_002',
      start_time: '2024-01-15T11:05:12Z',
      end_time: '2024-01-15T11:08:12Z',
      duration: 180,
      commands_count: 12,
      attacker_ip: '198.51.100.23',
      attacker_country: 'Russia',
      attacker_asn: 'AS12345 ROSTELECOM',
      intent: 'credential_hunting',
      skill_level: 8,
      confidence: 0.89,
      status: 'completed',
      cloud_provider: 'aws',
      commands: [
        { timestamp: '11:05:15', command: 'aws sts get-caller-identity' },
        { timestamp: '11:05:30', command: 'cat ~/.aws/credentials' },
        { timestamp: '11:05:45', command: 'env | grep AWS' },
        { timestamp: '11:06:00', command: 'aws iam list-access-keys' },
      ]
    },
    // ... more sessions would be here
  ];

  const filteredSessions = sessions.filter(s => {
    const matchesSearch = !searchQuery ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.attacker_ip.includes(searchQuery) ||
      s.attacker_country.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesIntent = intentFilter === 'all' || s.intent === intentFilter;
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;

    return matchesSearch && matchesIntent && matchesStatus;
  }).sort((a, b) => {
    const aVal = a[sortBy as keyof Session];
    const bVal = b[sortBy as keyof Session];
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  const intents = ['cloud_recon', 'credential_hunting', 'privilege_escalation', 'data_access', 'persistence', 'lateral_movement'];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <main className="lg:ml-64 p-4 lg:p-6">
        {/* Page Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sessions</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              All attacker sessions with intent classification
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              New Live Session
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions (IP, ID, country)..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
              />
            </div>
            <select
              value={intentFilter}
              onChange={(e) => setIntentFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
            >
              <option value="all">All Intents</option>
              {intents.map(i => (
                <option key={i} value={i}>{i.replace('_', ' ')}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Sessions Table */}
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {[
                    { key: 'id', label: 'Session ID' },
                    { key: 'start_time', label: 'Start Time' },
                    { key: 'attacker_ip', label: 'Attacker' },
                    { key: 'duration', label: 'Duration' },
                    { key: 'commands_count', label: 'Commands' },
                    { key: 'intent', label: 'Primary Intent' },
                    { key: 'skill_level', label: 'Skill' },
                    { key: 'confidence', label: 'Confidence' },
                    { key: 'status', label: 'Status' },
                    { key: 'cloud_provider', label: 'Cloud' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200"
                      onClick={() => {
                        if (sortBy === col.key) {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy(col.key);
                          setSortOrder('desc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {sortBy === col.key && (sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                      </div>
                    </th>
                  ))}
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr key={session.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono text-sm text-slate-600 dark:text-slate-300">{session.id}</td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      {format(new Date(session.start_time), 'MMM d, yyyy HH:mm:ss')}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{session.attacker_ip}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">({session.attacker_country})</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300 font-mono">{session.duration}s</td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300 font-mono">{session.commands_count}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${getIntentBadgeColor(session.intent)} capitalize`}>
                        {session.intent.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1">
                        <span>{session.skill_level}/10</span>
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full"
                            style={{ width: `${(Obj
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      {(session.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${session.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge badge-primary capitalize`}>{session.cloud_provider}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/sessions/${session.id}`}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/terminal?session=${session.id}`}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                          title="View Terminal"
                        >
                          <Terminal className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => setSelectedSession(session)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                          title="Threat Intel"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSessions.length === 0 && (
            <div className="py-12 text-center">
              <Search className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-slate-500 dark:text-slate-400">No sessions found matching your criteria</p>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between py-4 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing {filteredSessions.length} of {sessions.length} sessions
            </p>
            <div className="flex gap-2">
              <button className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50" disabled>
                Previous
              </button>
              <button className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50" disabled>
                Next
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Session Detail Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold">Session Details: {selectedSession.id}</h2>
              <button onClick={() => setSelectedSession(null)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <ChevronDown className="w-5 h-5 rotate-180" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div><p className="text-sm text-slate-500">Duration</p><p className="font-mono">{selectedSession.duration}s</p></div>
                <div><p className="text-sm text-slate-500">Commands</p><p className="font-mono">{selectedSession.commands_count}</p></div>
                <div><p className="text-sm text-slate-500">Attacker IP</p><p className="font-mono">{selectedSession.attacker_ip}</p></div>
                <div><p className="text-sm text-slate-500">Country/ASN</p><p className="font-mono text-sm">{selectedSession.attacker_country} / {selectedSession.attacker_asn}</p></div>
                <div><p className="text-sm text-slate-500">Primary Intent</p><p><span className={`badge ${getIntentBadgeColor(selectedSession.intent)} capitalize`}>{selectedSession.intent.replace('_', ' ')}</span></p></div>
                <div><p className="text-sm text-slate-500">Skill/Confidence</p><p>{selectedSession.skill_level}/10 · {(selectedSession.confidence * 100).toFixed(0)}%</p></div>
              </div>

              <h3 className="font-semibold mb-3">Command History</h3>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-green-300 max-h-96 overflow-y-auto">
                {selectedSession.commands.map((cmd, i) => (
                  <div key={i} className="border-b border-slate-800 py-1 last:border-0">
                    <span className="text-slate-400">[{cmd.timestamp}]</span>{' '}
                    <span className="text-yellow-300">$</span>{' '}
                    <span>{cmd.command}</span>
                    {cmd.intent && <span className="ml-2 text-xs text-slate-500">({cmd.intent})</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getIntentBadgeColor(intent: string): string {
  const colors: Record<string, string> = {
    cloud_recon: 'badge-primary',
    credential_hunting: 'badge-danger',
    privilege_escalation: 'badge-warning',
    data_access: 'badge-purple',
    persistence: 'badge-pink',
    lateral_movement: 'badge-cyan',
  };
  return colors[intent] || 'badge-gray';
}